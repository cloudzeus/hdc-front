import { getTranslations } from "next-intl/server";
import { HdcContentPage } from "@/components/content/HdcContentPage";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { Article } from "@/lib/blog/articles";
import { articleJsonLd, articlePath, ARTICLE_PATH } from "@/lib/blog/post-page";
import { upGreek } from "@/lib/greek";
import { breadcrumbJsonLd } from "@/lib/seo/structured-data";
import type { FaqPair } from "@/lib/seo/product-faq";

/**
 * One article or guide, in the content-page frame: the short answer first
 * (what a snippet or an AI quotes), the body, the FAQ the `FAQPage` is built
 * from, and the official pages the figures come from.
 *
 * Greek text on every locale (SEO is Greek only), marked `lang="el"`.
 */
export async function ArticleView({ article, locale }: { article: Article; locale: Locale }) {
  const t = await getTranslations("articles");
  const base = ARTICLE_PATH[article.kind];
  const section = article.kind === "GUIDE" ? t("odigoi") : t("blog");
  const date = new Date(article.publishedAt);

  const crumbs = breadcrumbJsonLd(
    [
      { name: "Αρχική", path: "/" },
      { name: article.kind === "GUIDE" ? "Οδηγοί αγοράς" : "Blog", path: base },
      { name: article.title, path: articlePath(article) },
    ],
    "el",
  );
  const ld = articleJsonLd(article);

  return (
    <HdcContentPage
      locale={locale}
      title={article.title}
      trail={[{ href: base, label: section }]}
      jsonLd={{ "@context": "https://schema.org", "@graph": [...ld["@graph"], { ...crumbs, "@context": undefined }] }}
    >
      <p className="hdc-cp-meta">
        {article.draft && <span className="hdc-art-draft">{t("proschedio")}</span>}
        {locale !== "el" && (
          <span className="hdc-cp-lang" lang={locale}>
            {t("mono_ellinika")}
          </span>
        )}
        {!Number.isNaN(date.getTime()) && (
          <time dateTime={article.publishedAt}>
            {new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Athens" }).format(date)}
          </time>
        )}
        {article.readingMinutes != null && <span>{upGreek(t("anagnosi", { minutes: article.readingMinutes }))}</span>}
      </p>

      <div lang="el">
        {article.image && (
          // eslint-disable-next-line @next/next/no-img-element -- CDN image; the optimiser is off
          <img src={article.image.url} alt="" className="hdc-art-hero" fetchPriority="high" />
        )}

        {article.answer && (
          <div className="hdc-answer">
            <b>{t("syntomi_apantisi")}</b>
            <p>{article.answer}</p>
          </div>
        )}

        <div className="hdc-prose" dangerouslySetInnerHTML={{ __html: article.html }} />

        <FaqSection title={t("syxnes_erotiseis")} faq={article.faq} />

        {article.sources.length > 0 && (
          <aside className="hdc-sources" aria-labelledby="hdc-sources-h">
            <h2 id="hdc-sources-h">{t("piges")}</h2>
            <p>{t("piges_lead")}</p>
            <ul>
              {article.sources.map((url) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      <p className="hdc-art-back">
        <Link href={base} className="hdc-btn hdc-btn-ink" prefetch={false}>
          ← {upGreek(article.kind === "GUIDE" ? t("oloi_oi_odigoi") : t("ola_ta_arthra"))}
        </Link>
      </p>
    </HdcContentPage>
  );
}

/** The «Συχνές ερωτήσεις» accordion — the same pairs the FAQPage declares. */
export function FaqSection({ title, faq, id = "syxnes-erotiseis" }: { title: string; faq: FaqPair[]; id?: string }) {
  if (faq.length === 0) return null;
  return (
    <section className="hdc-cp-section" aria-labelledby={id}>
      <h2 id={id} className="hdc-disp">
        {upGreek(title)}
      </h2>
      <div className="hdc-faq">
        {faq.map((pair) => (
          <details key={pair.q}>
            <summary>{pair.q}</summary>
            <div className="hdc-prose">
              <p>{pair.a}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
