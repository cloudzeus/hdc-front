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
import { findTerm, termView } from "@/lib/content/eshop-content-map";
import { contentMetadata } from "@/lib/content/page-meta";

/** Terms of use — the text is HDCtool's `terms-of-use`. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "content" });
  return contentMetadata({
    path: "/oroi-chrisis",
    locale,
    title: t("t_oroi"),
    description: t("lead_oroi"),
  });
}

export default async function TermsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, content] = await Promise.all([getTranslations("content"), getEshopContent()]);
  const term = content ? termView(findTerm(content.terms, "terms"), locale) : null;

  return (
    <HdcContentPage locale={locale} title={t("t_oroi")} lead={t("lead_oroi")}>
      {term ? (
        <>
          <ContentMeta locale={locale} greekOnly={term.fallback} updatedAt={term.updatedAt} />
          <SanitizedProse html={term.html} lang={term.fallback ? "el" : locale} />
        </>
      ) : (
        <ContentSoon />
      )}
    </HdcContentPage>
  );
}
