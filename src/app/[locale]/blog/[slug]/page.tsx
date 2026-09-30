import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { getBlogPost } from "@/lib/blog/blog";
import { blogPostMetadata, loadBlogPost } from "@/lib/blog/post-page";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";
import { Zone } from "@/components/zones/Zone";
import { PRIMARY_PHONE } from "@/config/shop";

type PageProps = { params: Promise<{ locale: Locale; slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const post = await loadBlogPost(() => getBlogPost(slug, locale));
  // No post (or no posts endpoint yet): the page is a 404, see below.
  return post ? blogPostMetadata(post, locale) : {};
}

export default async function BlogPostPage({ params }: PageProps) {
  const t = await getTranslations("blog.page");
  const { locale, slug } = await params;
  setRequestLocale(locale);

  /*
   * A 404 for any slug that is not a post — also while HDCtool has no posts
   * endpoint: a "not yet wired" page for every URL anyone types is an endless
   * supply of soft 404s. (Under [locale]/loading.tsx the page streams, so the
   * status stays 200 and Next marks the not-found page `noindex`.)
   */
  const post = await loadBlogPost(() => getBlogPost(slug, locale));
  if (!post) notFound();

  const [menuTree, brands, stats, rootCategories, miniCart] = await Promise.all(
    [
      getMenuTree(locale),
      getTopBrands(locale),
      getCatalogueStats(),
      getRootCategories(locale),
      getMiniCart(locale),
    ],
  );

  const date = new Date(post.publishedAt);

  return (
    <>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />

      <main id="main">
        <Zone id="article.top" locale={locale} />
        <div className="shell-x bg-k-ink-deep">
          <nav
            aria-label="Breadcrumb"
            className="t-util flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-1 py-2 text-white/45"
          >
            <Link href="/" className="shrink-0 text-white/60 hover:text-white">
              {upGreek(t("archiki"))}
            </Link>
            <span className="text-k-red">/</span>
            <Link
              href="/blog"
              className="shrink-0 text-white/60 hover:text-white"
            >
              BLOG
            </Link>
            <span className="text-k-red">/</span>
            <span className="truncate text-white">{post.title}</span>
          </nav>

          {post && (
            <div className="max-w-[68ch] pt-2.5 pb-9">
              <h1 className="font-display text-[24px] leading-[1.18] t-display text-balance text-white lg:text-[36px]">
                {post.title}
              </h1>
              {post.shortDescription && (
                <p className="mt-4 text-[14px] leading-[1.7] text-white/65 lg:text-[16px]">
                  {post.shortDescription}
                </p>
              )}
              <p className="t-brand-count mt-5 flex flex-wrap items-center gap-2.5 text-white/45">
                {!Number.isNaN(date.getTime()) && (
                  <time dateTime={post.publishedAt}>
                    {date.toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </time>
                )}
                {post.readingMinutes != null && (
                  <>
                    <span
                      aria-hidden
                      className="block h-[12px] w-px bg-white/20"
                    />
                    <span>
                      {upGreek(
                        t("anagnosi", { readingMinutes: post.readingMinutes }),
                      )}
                    </span>
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        <section className="band-base">
          <div className="shell-x py-8 lg:py-12">
            <article className="mx-auto max-w-[70ch]">
              {post.image && (
                <span className="relative mb-8 block h-[240px] overflow-hidden bg-k-surface-2 lg:mb-10 lg:h-[420px]">
                  <Image
                    src={post.image.url}
                    alt=""
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 70ch"
                    className="object-cover"
                  />
                </span>
              )}

              {/*
                HDCtool's editor is the only writer and sanitises on the way
                in; this renders what it stored. If the editor ever opens to
                untrusted authors, sanitise HERE too — the storefront must
                not be the only place that trusts it.
              */}
              <div
                className="prose-kolleris"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />
            </article>
          </div>
        </section>

        <Zone id="article.middle" locale={locale} />

        <section className="band-alt border-t border-k-line">
          <div className="shell-x flex flex-wrap items-center justify-between gap-4 py-7">
            <p className="text-[13px] text-k-text-3">
              {t("erotisi_gia_kati_apo_to")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/blog"
                className="t-btn-sm border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
              >
                ← {upGreek(t("ola_ta_arthra"))}
              </Link>
              <a
                href={`tel:${PRIMARY_PHONE.e164}`}
                className="t-btn-sm bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red"
              >
                {PRIMARY_PHONE.display}
              </a>
            </div>
          </div>
        </section>
        <Zone id="article.below" locale={locale} />
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
