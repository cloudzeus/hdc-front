import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Blocks, ContentMeta, HdcContentPage } from "@/components/content/HdcContentPage";
import type { Locale } from "@/i18n/routing";
import { PAYMENT } from "@/lib/content/hdc-pages";
import { contentMetadata } from "@/lib/content/page-meta";

/**
 * Payment methods: the previous HDC site's text, cut to what the checkout
 * offers — card and IRIS through Viva, bank transfer with a Viva payment
 * code and the stock hold from `STOCK_HOLD_HOURS`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "content" });
  return contentMetadata({
    path: "/tropoi-pliromis",
    locale,
    title: t("t_pliromi"),
    description: t("lead_pliromi"),
  });
}

export default async function PaymentPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("content");

  return (
    <HdcContentPage locale={locale} title={t("t_pliromi")} lead={t("lead_pliromi")}>
      <ContentMeta locale={locale} greekOnly />
      <Blocks blocks={PAYMENT} />
    </HdcContentPage>
  );
}
