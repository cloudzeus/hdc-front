import { getTranslations } from "next-intl/server";
import { SanitizedProse } from "@/components/content/HdcContentPage";
import { HomeSectionHead } from "@/components/home/HomeSectionHead";
import type { FaqItemView } from "@/lib/content/eshop-content-map";
import { jsonLdHtml } from "@/lib/seo/json-ld";
import type { Locale } from "@/i18n/routing";

/**
 * A short FAQ on the home page — the first few of HDCtool's Q&A, with a link to
 * the full list.
 *
 * The home page carries only the shop-and-site schema; the detailed structured
 * data lives on the pages it describes. A GEO/AEO crawler that fetches the home
 * URL in isolation therefore sees no answerable question on it, and scores the
 * site as having none. This section gives the home page real Q&A content and
 * the matching `FAQPage` JSON-LD.
 *
 * Built exactly like the FAQ page (`/syxnes-erotiseis`): native `<details>`, and
 * the JSON-LD is generated from the SAME items the section renders, so what a
 * model quotes cannot drift from what the visitor reads. No items, no section
 * and no JSON-LD.
 */
export async function HomeFaq({
  items,
  locale,
}: {
  items: FaqItemView[];
  locale: Locale;
}) {
  if (!items.length) return null;
  const t = await getTranslations("home.HomeFaq");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answerText },
    })),
  };

  return (
    <section className="hdc-sec">
      <div className="hdc-wrap">
        <HomeSectionHead
          title={t("titlos")}
          link={{ href: "/syxnes-erotiseis", label: `${t("oles")} →` }}
        />
        <div className="hdc-faq">
          {items.map((item) => (
            <details key={item.id}>
              <summary>{item.question}</summary>
              <SanitizedProse html={item.answerHtml} lang={item.fallback ? "el" : locale} />
            </details>
          ))}
        </div>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />
    </section>
  );
}
