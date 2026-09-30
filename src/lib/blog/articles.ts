import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { ContentKind } from "@/generated/prisma/client";
import type { BlogImage, BlogListResponse, BlogPostSummary } from "@/lib/blog/contract";
import type { FaqPair } from "@/lib/seo/product-faq";
import { readingMinutes, renderMarkdown } from "@/lib/seo/markdown";
import { faqFromJson, stringsFromJson } from "@/lib/seo/seo-merge";

/**
 * Articles and buying guides, from the storefront's own database
 * (`ContentArticle`, admin «SEO & Περιεχόμενο»; the drafts in docs/content are
 * imported by scripts/content/import-content.ts). Not HDCtool any more.
 *
 * Only PUBLISHED rows are public. A draft can be previewed with `?preview=1`
 * by a signed-in admin who may see the SEO section (`canPreviewDrafts`),
 * always `noindex`; anyone else gets the 404.
 *
 * Greek only: the same article answers on /en and /it for a visitor who
 * switched language, `noindex` there with the Greek canonical.
 */

export type ArticleKind = ContentKind;

/** Where each kind lives. */
export const ARTICLE_BASE: Record<ArticleKind, string> = { ARTICLE: "/blog", GUIDE: "/odigoi" };

export type ArticleSummary = BlogPostSummary & { kind: ArticleKind };

export type Article = ArticleSummary & {
  seoTitle: string | null;
  metaDescription: string | null;
  answer: string | null;
  /** The body as HTML (Markdown rendered, raw HTML escaped). */
  html: string;
  faq: FaqPair[];
  keywords: string[];
  entities: string[];
  sources: string[];
  draft: boolean;
};

/**
 * May this request see drafts? Only a signed-in admin with `seo.view` — the
 * admin session cookie is on the whole site, so the editor's «Άνοιγμα στο
 * κατάστημα» works in production too. Read only when `?preview=1` is asked.
 */
export async function canPreviewDrafts(): Promise<boolean> {
  const [{ auth }, { can }] = await Promise.all([import("@/auth"), import("@/lib/rbac")]);
  const session = await auth().catch(() => null);
  return can(session?.user.role, "seo.view");
}

const image = (url: string | null, alt: string | null): BlogImage | null =>
  url ? { url, alt, mainImage: true, width: null, height: null } : null;

type Row = {
  kind: ArticleKind;
  slug: string;
  title: string;
  metaDescription: string | null;
  answer: string | null;
  body: string;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const summarySelect = {
  kind: true,
  slug: true,
  title: true,
  metaDescription: true,
  answer: true,
  body: true,
  heroImageUrl: true,
  heroImageAlt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toSummary(row: Row): ArticleSummary {
  return {
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    shortDescription: row.metaDescription ?? row.answer,
    image: image(row.heroImageUrl, row.heroImageAlt ?? row.title),
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    readingMinutes: readingMinutes(row.answer, row.body),
  };
}

export const listArticles = cache(
  async (kind: ArticleKind, page = 1, perPage = 12): Promise<BlogListResponse & { posts: ArticleSummary[] }> => {
    const where = { kind, status: "PUBLISHED" as const, publishedAt: { not: null } };
    const [total, rows] = await Promise.all([
      prisma.contentArticle.count({ where }),
      prisma.contentArticle.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip: (Math.max(1, page) - 1) * perPage,
        take: perPage,
        select: summarySelect,
      }),
    ]);
    return {
      posts: rows.map(toSummary),
      total,
      page: Math.max(1, page),
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    };
  },
);

export const getArticle = cache(
  /** `preview`: the caller has checked `canPreviewDrafts()`. */
  async (kind: ArticleKind, slug: string, preview = false): Promise<Article | null> => {
    const row = await prisma.contentArticle.findUnique({ where: { slug } });
    if (!row || row.kind !== kind) return null;
    const draft = row.status !== "PUBLISHED" || row.publishedAt == null;
    if (draft && !preview) return null;
    return {
      ...toSummary(row),
      seoTitle: row.seoTitle,
      metaDescription: row.metaDescription,
      answer: row.answer,
      html: renderMarkdown(row.body),
      faq: faqFromJson(row.faq),
      keywords: stringsFromJson(row.keywords),
      entities: stringsFromJson(row.entities),
      sources: stringsFromJson(row.sources),
      draft,
    };
  },
);

/** Published articles among `slugs`, in the order given — a hub's «related» list. */
export async function publishedAmong(slugs: string[]): Promise<ArticleSummary[]> {
  if (slugs.length === 0) return [];
  const rows = await prisma.contentArticle.findMany({
    where: { slug: { in: slugs }, status: "PUBLISHED", publishedAt: { not: null } },
    select: summarySelect,
  });
  const bySlug = new Map(rows.map((r) => [r.slug, toSummary(r)]));
  return slugs.map((s) => bySlug.get(s)).filter((a): a is ArticleSummary => a != null);
}

/** Every published article and guide, for llms.txt and llms-full.txt: guides first, newest first. */
export async function publishedForLlms(): Promise<
  Array<{ kind: ArticleKind; path: string; title: string; answer: string | null }>
> {
  const rows = await prisma.contentArticle.findMany({
    where: { status: "PUBLISHED", publishedAt: { not: null } },
    orderBy: [{ kind: "desc" }, { publishedAt: "desc" }],
    select: { kind: true, slug: true, title: true, answer: true },
  });
  return rows.map((r) => ({ kind: r.kind, path: `${ARTICLE_BASE[r.kind]}/${r.slug}`, title: r.title, answer: r.answer }));
}
