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

/** Returns — the text is HDCtool's `return-policy`. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "content" });
  return contentMetadata({
    path: "/epistrofes",
    locale,
    title: t("t_epistrofes"),
    description: t("lead_epistrofes"),
  });
}

export default async function ReturnsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, content] = await Promise.all([getTranslations("content"), getEshopContent()]);
  const term = content ? termView(findTerm(content.terms, "returns"), locale) : null;

  return (
    <HdcContentPage locale={locale} title={t("t_epistrofes")} lead={t("lead_epistrofes")}>
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
