import type { Metadata } from "next";
import type { Locale } from "@/i18n/routing";
import type { Article, ArticleSummary } from "@/lib/blog/articles";
import { SHOP } from "@/config/shop";
import { absoluteUrl, pageMeta, siteOrigin } from "@/lib/seo/urls";
import { titleWithSite } from "@/lib/seo/title";
import { faqJsonLd } from "@/lib/seo/product-faq";

/** Where each kind of article lives (mirrors ARTICLE_BASE, client-safe). */
export const ARTICLE_PATH: Record<Article["kind"], string> = { ARTICLE: "/blog", GUIDE: "/odigoi" };

export const articlePath = (a: Pick<ArticleSummary, "kind" | "slug">) => `${ARTICLE_PATH[a.kind]}/${a.slug}`;

/**
 * An article's metadata: its own canonical (it used to inherit the site
 * root's) and Open Graph as an article, with the SEO title and description
 * the editor wrote.
 *
 * Greek only for search (owner decision, 30/9/2026): the canonical is always
 * the Greek article, there are no en/it alternates, and an en/it copy is
 * `noindex, follow` — there for visitors who switch language, not for search.
 * A draft preview is `noindex, nofollow`.
 */
export function articleMetadata(article: Article, locale: Locale): Metadata {
  const path = articlePath(article);
  const title = article.seoTitle ?? article.title;
  const description = article.metaDescription ?? article.answer ?? undefined;
  const meta = pageMeta({
    path,
    locale,
    title,
    description: description ?? article.title,
    image: article.image?.url,
    type: "article",
  });
  const robots = article.draft
    ? { robots: { index: false, follow: false } }
    : locale === "el"
      ? {}
      : { robots: { index: false, follow: true } };
  return {
    ...meta,
    alternates: { canonical: absoluteUrl(path, "el") },
    ...robots,
    openGraph: { ...meta.openGraph, publishedTime: article.publishedAt, modifiedTime: article.updatedAt },
    title: titleWithSite(title),
    description,
    ...(article.keywords.length ? { keywords: article.keywords } : {}),
  };
}

/**
 * The article as structured data: a `BlogPosting` (a guide is an `Article`)
 * in Greek, published by the store, with the short answer as its abstract,
 * the entities it is about and the official pages it cites — plus the
 * `FAQPage` built from the same pairs the page shows.
 */
export function articleJsonLd(article: Article) {
  const origin = siteOrigin();
  const url = absoluteUrl(articlePath(article), "el");
  const posting = {
    "@type": article.kind === "GUIDE" ? "Article" : "BlogPosting",
    "@id": `${url}#article`,
    headline: article.title,
    ...(article.metaDescription ? { description: article.metaDescription } : {}),
    ...(article.answer ? { abstract: article.answer } : {}),
    url,
    mainEntityOfPage: url,
    inLanguage: "el-GR",
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    ...(article.image ? { image: [article.image.url] } : {}),
    author: { "@type": "Organization", "@id": `${origin}/#shop`, name: SHOP.name },
    publisher: { "@id": `${origin}/#shop` },
    isPartOf: { "@id": `${origin}/#website` },
    ...(article.keywords.length ? { keywords: article.keywords.join(", ") } : {}),
    ...(article.entities.length
      ? { about: article.entities.map((name) => ({ "@type": "Thing", name })) }
      : {}),
    ...(article.sources.length ? { citation: article.sources } : {}),
  };
  const faq = faqJsonLd(article.faq);
  return {
    "@context": "https://schema.org",
    "@graph": [posting, ...(faq ? [{ "@type": faq["@type"], mainEntity: faq.mainEntity, inLanguage: "el-GR" }] : [])],
  };
}
