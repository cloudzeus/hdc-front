import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { absoluteUrl, sitemapAlternates } from "@/lib/seo/urls";
import { getAllModels } from "@/lib/catalog/models";
import { modelPath } from "@/lib/milwaukee/model-slug";
import { articlePath } from "@/lib/blog/post-page";

/**
 * The sitemap.
 *
 * Every URL carries its translations as `alternates`, which is the part that
 * matters here. Greek is served from the bare path and English and Italian from
 * a prefix, so without them a crawler sees three pages competing rather than
 * one page in three languages — and the two prefixed ones lose, because the
 * bare path has the links.
 *
 * `lastModified` comes from real timestamps. A sitemap that stamps everything
 * with today teaches a crawler to ignore the field, and then the one page that
 * genuinely changed looks like all the others.
 *
 * Priorities are relative and deliberately few: the home page, then the
 * catalogue entry points, then products. Everything at 0.8 is everything at the
 * same priority.
 */

/** Bounded so one query cannot become a 200 MB response as the catalogue grows. */
const MAX_PRODUCTS = 45_000;

/** Pages that exist without a database row. */
const STATIC_PATHS: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/katalogos", priority: 0.9, changeFrequency: "daily" },
  { path: "/prosfores", priority: 0.8, changeFrequency: "daily" },
  { path: "/nees-afixeis", priority: 0.8, changeFrequency: "daily" },
  { path: "/milwaukee", priority: 0.9, changeFrequency: "weekly" },
  { path: "/milwaukee-m18", priority: 0.9, changeFrequency: "weekly" },
  { path: "/milwaukee-m12", priority: 0.9, changeFrequency: "weekly" },
  { path: "/mx-fuel", priority: 0.8, changeFrequency: "weekly" },
  { path: "/packout", priority: 0.8, changeFrequency: "weekly" },
  { path: "/odigoi", priority: 0.6, changeFrequency: "weekly" },
  { path: "/etaireia", priority: 0.5, changeFrequency: "monthly" },
  { path: "/epikoinonia", priority: 0.6, changeFrequency: "monthly" },
  { path: "/syxnes-erotiseis", priority: 0.5, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.6, changeFrequency: "weekly" },
  { path: "/logariasmos/entopismos", priority: 0.4, changeFrequency: "monthly" },
];

/*
 * Built per request, not at deploy time.
 *
 * Next generates a sitemap during `next build` by default, and this one reads
 * 5.821 rows from a database the build container cannot reach. It is also the
 * wrong moment: a sitemap frozen at deploy is stale for every product added
 * between deploys, which is about 45 a day.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const [products, categories, models, articles] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
      orderBy: { mtrl: "asc" },
      take: MAX_PRODUCTS,
    }),
    prisma.category.findMany({
      // A category with nothing in it is a page that says "no products", and
      // submitting those is how a crawl budget is spent on empty rooms.
      where: { productCount: { gt: 0 } },
      select: { slug: true, updatedAt: true },
    }),
    // Model pages with at least two versions: one version is its own product page.
    getAllModels().then((all) => all.filter((m) => m.versions >= 2)),
    prisma.contentArticle.findMany({
      where: { status: "PUBLISHED", publishedAt: { not: null } },
      select: { kind: true, slug: true, updatedAt: true },
    }),
  ]);

  /*
   * No brand pages: the store is Milwaukee only, and /brands/milwaukee is a
   * 301 to the /milwaukee hub. Articles and guides only once published.
   */

  const entry = (
    path: string,
    lastModified: Date,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  ) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency,
    priority,
    alternates: { languages: sitemapAlternates(path) },
  });

  return [
    ...STATIC_PATHS.map((s) => entry(s.path, now, s.priority, s.changeFrequency)),
    ...categories.map((c: { slug: string; updatedAt: Date }) => entry(`/katalogos/${c.slug}`, c.updatedAt, 0.7, "weekly" as const)),
    ...models.map((m) => entry(modelPath(m.root), new Date(m.lastUpdated), 0.7, "weekly" as const)),
    ...articles.map((a) => entry(articlePath(a), a.updatedAt, 0.5, "monthly" as const)),
    ...products.map((p: { slug: string; updatedAt: Date }) => entry(`/proion/${p.slug}`, p.updatedAt, 0.6, "weekly" as const)),
  ];
}
