import "server-only";
import { prisma } from "@/lib/prisma";
import { getAllModels } from "@/lib/catalog/models";
import { modelPath } from "@/lib/milwaukee/model-slug";
import { articlePath } from "@/lib/blog/post-page";
import { HUB_KEYS, HUBS } from "@/lib/seo/hubs";
import { absoluteUrl } from "@/lib/seo/urls";
import type { SitemapEntry } from "@/lib/seo/sitemap-xml";

/**
 * What each sitemap lists — Greek URLs only (SEO is Greek only; the en/it
 * pages are `noindex`). Real timestamps where rows have them; the static
 * pages carry a fixed date, changed by hand when their text changes, because
 * a sitemap that stamps everything with today teaches a crawler to ignore
 * the field.
 */

export const SITEMAPS = ["pages", "categories", "models", "products", "articles"] as const;
export type SitemapKind = (typeof SITEMAPS)[number];

/** When the static pages' text last changed. */
const STATIC_LASTMOD = "2026-09-30";

/**
 * Pages that exist without a database row and are meant for search. The
 * legal and service pages are `noindex` (src/lib/content/page-meta.ts) and so
 * are not here; neither is order tracking, which robots.txt closes.
 */
const STATIC_PAGES: Array<{ path: string; priority: number; changefreq: SitemapEntry["changefreq"] }> = [
  { path: "/", priority: 1, changefreq: "daily" },
  { path: "/katalogos", priority: 0.9, changefreq: "daily" },
  { path: "/prosfores", priority: 0.8, changefreq: "daily" },
  { path: "/nees-afixeis", priority: 0.8, changefreq: "daily" },
  { path: "/etaireia", priority: 0.5, changefreq: "monthly" },
  { path: "/epikoinonia", priority: 0.6, changefreq: "monthly" },
  { path: "/syxnes-erotiseis", priority: 0.5, changefreq: "monthly" },
  { path: "/blog", priority: 0.6, changefreq: "weekly" },
  { path: "/odigoi", priority: 0.6, changefreq: "weekly" },
];

/** Bounded so one query cannot become a 200 MB response as the catalogue grows. */
const MAX_PRODUCTS = 45_000;
const MAX_IMAGES = 10;

export async function sitemapEntries(kind: SitemapKind): Promise<SitemapEntry[]> {
  switch (kind) {
    case "pages":
      return STATIC_PAGES.map((p) => ({ loc: absoluteUrl(p.path, "el"), lastmod: STATIC_LASTMOD, changefreq: p.changefreq, priority: p.priority }));

    case "categories": {
      // A category with nothing in it is a page that says "no products".
      const rows = await prisma.category.findMany({
        where: { productCount: { gt: 0 } },
        select: { slug: true, updatedAt: true },
        orderBy: { slug: "asc" },
      });
      return rows.map((c) => ({ loc: absoluteUrl(`/katalogos/${c.slug}`, "el"), lastmod: c.updatedAt, changefreq: "weekly", priority: 0.7 }));
    }

    case "models": {
      // The hubs, then models with two or more versions: one version is its own product page.
      const models = (await getAllModels()).filter((m) => m.versions >= 2);
      return [
        ...HUB_KEYS.map((k) => ({ loc: absoluteUrl(HUBS[k].path, "el"), lastmod: STATIC_LASTMOD, changefreq: "weekly" as const, priority: 0.9 })),
        ...models.map((m) => ({ loc: absoluteUrl(modelPath(m.root), "el"), lastmod: m.lastUpdated, changefreq: "weekly" as const, priority: 0.7 })),
      ];
    }

    case "products": {
      const rows = await prisma.product.findMany({
        where: { isActive: true },
        select: {
          slug: true,
          updatedAt: true,
          images: { orderBy: [{ isFeature: "desc" }, { order: "asc" }], take: MAX_IMAGES, select: { url: true } },
        },
        orderBy: { mtrl: "asc" },
        take: MAX_PRODUCTS,
      });
      return rows.map((p) => ({
        loc: absoluteUrl(`/proion/${p.slug}`, "el"),
        lastmod: p.updatedAt,
        changefreq: "weekly",
        priority: 0.6,
        // Documents (PDF) are not pictures.
        images: p.images.map((i) => i.url).filter((u) => !/\.pdf(\?|#|$)/i.test(u)),
      }));
    }

    case "articles": {
      const rows = await prisma.contentArticle.findMany({
        where: { status: "PUBLISHED", publishedAt: { not: null } },
        select: { kind: true, slug: true, updatedAt: true, heroImageUrl: true },
        orderBy: { publishedAt: "desc" },
      });
      return rows.map((a) => ({
        loc: absoluteUrl(articlePath(a), "el"),
        lastmod: a.updatedAt,
        changefreq: "monthly",
        priority: 0.5,
        images: a.heroImageUrl ? [a.heroImageUrl] : [],
      }));
    }
  }
}
