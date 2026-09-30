import { getTranslations } from "next-intl/server";
import { HdcContentPage } from "@/components/content/HdcContentPage";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { ArticleKind, ArticleSummary } from "@/lib/blog/articles";
import { articlePath, ARTICLE_PATH } from "@/lib/blog/post-page";
import { upGreek } from "@/lib/greek";
import { blogJsonLd, breadcrumbJsonLd } from "@/lib/seo/structured-data";

/** The list of published articles (/blog) or guides (/odigoi), newest first. */
export async function ArticleIndexView({
  kind,
  locale,
  posts,
  page,
  totalPages,
}: {
  kind: ArticleKind;
  locale: Locale;
  posts: ArticleSummary[];
  page: number;
  totalPages: number;
}) {
  const t = await getTranslations("articles");
  const base = ARTICLE_PATH[kind];
  const title = kind === "GUIDE" ? t("odigoi") : t("blog");
  const lead = kind === "GUIDE" ? t("odigoi_lead") : t("blog_lead");

  const crumbs = breadcrumbJsonLd([{ name: title, path: base }], locale);
  const list =
    posts.length > 0
      ? blogJsonLd(
          {
            name: title,
            description: lead,
            path: base,
            posts: posts.map((p) => ({ title: p.title, path: articlePath(p), publishedAt: p.publishedAt })),
          },
          locale,
        )
      : null;

  return (
    <HdcContentPage
      locale={locale}
      title={title}
      lead={lead}
      help={false}
      jsonLd={{
        "@context": "https://schema.org",
        "@graph": [{ ...crumbs, "@context": undefined }, ...(list ? [{ ...list, "@context": undefined }] : [])],
      }}
    >
      {posts.length === 0 ? (
        <p className="hdc-art-empty">{kind === "GUIDE" ? t("odigoi_kanenas") : t("blog_kanena")}</p>
      ) : (
        <>
          <div className="hdc-art-list" lang="el">
            {posts.map((post) => (
              <Link key={post.slug} href={articlePath(post)} className="hdc-art-card" prefetch={false}>
                {post.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- CDN image; the optimiser is off
                  <img src={post.image.url} alt="" loading="lazy" />
                )}
                <div>
                  <h2>{post.title}</h2>
                  {post.shortDescription && <p>{post.shortDescription}</p>}
                  <small>
                    {new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Athens" }).format(
                      new Date(post.publishedAt),
                    )}
                    {post.readingMinutes != null && ` · ${upGreek(t("anagnosi", { minutes: post.readingMinutes }))}`}
                  </small>
                </div>
              </Link>
            ))}
          </div>
          {totalPages > 1 && (
            <nav aria-label={t("selides")} className="hdc-art-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <Link key={n} href={n === 1 ? base : `${base}?page=${n}`} aria-current={n === page ? "page" : undefined}>
                  {n}
                </Link>
              ))}
            </nav>
          )}
        </>
      )}
    </HdcContentPage>
  );
}
