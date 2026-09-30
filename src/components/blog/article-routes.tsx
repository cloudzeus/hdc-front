import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArticleIndexView } from "@/components/blog/ArticleIndexView";
import { ArticleView } from "@/components/blog/ArticleView";
import type { Locale } from "@/i18n/routing";
import { getArticle, listArticles, type ArticleKind } from "@/lib/blog/articles";
import { articleMetadata, ARTICLE_PATH } from "@/lib/blog/post-page";
import { pageMeta } from "@/lib/seo/urls";

/**
 * The two pages each kind of article has — the list and the article — shared
 * by /blog (ARTICLE) and /odigoi (GUIDE).
 *
 * An unknown or unpublished slug is a real 404: these routes have no
 * loading.tsx above them (route-boundaries.test.ts), so nothing streams
 * before `notFound()` can set the status.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type DetailProps = { params: Promise<{ locale: Locale; slug: string }>; searchParams: SearchParams };
type IndexProps = { params: Promise<{ locale: Locale }>; searchParams: SearchParams };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function articleDetailRoute(kind: ArticleKind) {
  const load = async ({ params, searchParams }: DetailProps) => {
    const [{ slug, locale }, sp] = await Promise.all([params, searchParams]);
    return { locale, article: await getArticle(kind, slug, first(sp.preview) === "1") };
  };

  async function generateMetadata(props: DetailProps): Promise<Metadata> {
    const { locale, article } = await load(props);
    return article ? articleMetadata(article, locale) : {};
  }

  async function Page(props: DetailProps) {
    const { locale, article } = await load(props);
    setRequestLocale(locale);
    if (!article) notFound();
    return <ArticleView article={article} locale={locale} />;
  }

  return { generateMetadata, Page };
}

export function articleIndexRoute(kind: ArticleKind) {
  const path = ARTICLE_PATH[kind];

  async function generateMetadata({ params, searchParams }: IndexProps): Promise<Metadata> {
    const [{ locale }, sp] = await Promise.all([params, searchParams]);
    const t = await getTranslations({ locale, namespace: "articles" });
    const title = kind === "GUIDE" ? t("odigoi") : t("blog");
    const description = kind === "GUIDE" ? t("odigoi_lead") : t("blog_lead");
    const page = Number(first(sp.page)) || 1;
    return {
      ...pageMeta({ path, locale, title, description }),
      // Greek only for search; page 2+ is followed, not indexed.
      ...(locale !== "el" || page > 1 ? { robots: { index: false, follow: true } } : {}),
      title,
      description,
    };
  }

  async function Page({ params, searchParams }: IndexProps) {
    const [{ locale }, sp] = await Promise.all([params, searchParams]);
    setRequestLocale(locale);
    const page = Math.max(1, Number(first(sp.page)) || 1);
    const data = await listArticles(kind, page);
    return (
      <ArticleIndexView kind={kind} locale={locale} posts={data.posts} page={data.page} totalPages={data.totalPages} />
    );
  }

  return { generateMetadata, Page };
}
