import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Blocks, ContentMeta, HdcContentPage } from "@/components/content/HdcContentPage";
import type { Locale } from "@/i18n/routing";
import { ABOUT } from "@/lib/content/hdc-pages";
import { contentMetadata } from "@/lib/content/page-meta";
import { infoPageJsonLd } from "@/lib/seo/structured-data";

/** About us: the previous HDC site's text, verbatim (Greek only). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "content" });
  return contentMetadata({
    path: "/etaireia",
    locale,
    title: t("t_etaireia"),
    description: t("lead_etaireia"),
    index: true,
  });
}

export default async function AboutPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("content");

  return (
    <HdcContentPage
      locale={locale}
      title={t("t_etaireia")}
      lead={t("lead_etaireia")}
      jsonLd={infoPageJsonLd(
        "AboutPage",
        { name: t("t_etaireia"), description: t("lead_etaireia"), path: "/etaireia" },
        locale,
      )}
    >
      <ContentMeta locale={locale} greekOnly />
      <Blocks blocks={ABOUT} />
    </HdcContentPage>
  );
}
