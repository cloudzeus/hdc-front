import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ContentMeta,
  ContentSoon,
  HdcContentPage,
  SanitizedProse,
} from "@/components/content/HdcContentPage";
import type { Locale } from "@/i18n/routing";
import { getEshopContent } from "@/lib/content/eshop-content";
import { faqView } from "@/lib/content/eshop-content-map";
import { contentMetadata } from "@/lib/content/page-meta";

/**
 * FAQ — HDCtool's Q&A for the HDC, in HDCtool's order.
 *
 * Native `<details>`: opens without JavaScript, sits in the accessibility tree
 * for free, and the browser's find-in-page reaches text in a closed answer.
 *
 * The FAQPage JSON-LD is built from the SAME list the page renders, so what a
 * search engine quotes cannot drift from what the visitor reads. No list, no
 * JSON-LD.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "content" });
  return contentMetadata({
    path: "/syxnes-erotiseis",
    locale,
    title: t("t_faq"),
    description: t("lead_faq"),
    index: true,
  });
}

export default async function FaqPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, content] = await Promise.all([getTranslations("content"), getEshopContent()]);
  const items = content ? faqView(content.qanda, locale) : [];

  const jsonLd = items.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answerText },
        })),
      }
    : undefined;

  return (
    <HdcContentPage locale={locale} title={t("t_faq")} lead={t("lead_faq")} jsonLd={jsonLd}>
      {items.length ? (
        <>
          <ContentMeta locale={locale} greekOnly={items.some((i) => i.fallback)} />
          <div className="hdc-faq">
            {items.map((item) => (
              <details key={item.id} id={item.id}>
                <summary>{item.question}</summary>
                <SanitizedProse html={item.answerHtml} lang={item.fallback ? "el" : locale} />
              </details>
            ))}
          </div>
        </>
      ) : (
        <ContentSoon />
      )}
    </HdcContentPage>
  );
}
