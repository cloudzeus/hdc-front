import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Blocks, ContentMeta, HdcContentPage } from "@/components/content/HdcContentPage";
import type { Locale } from "@/i18n/routing";
import { FREE_SHIPPING_THRESHOLD_NET } from "@/lib/cart/options";
import { SHIPPING } from "@/lib/content/hdc-pages";
import { contentMetadata } from "@/lib/content/page-meta";

/**
 * Shipping and delivery: the previous HDC site's text, verbatim, with the two
 * facts the checkout enforces on top — pickup is free, and courier delivery is
 * free over the threshold the cart uses (`FREE_SHIPPING_THRESHOLD_NET`).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "content" });
  return contentMetadata({
    path: "/apostoli-paradosi",
    locale,
    title: t("t_apostoli"),
    description: t("lead_apostoli"),
  });
}

export default async function ShippingPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("content");

  return (
    <HdcContentPage locale={locale} title={t("t_apostoli")} lead={t("lead_apostoli")}>
      <div className="hdc-cp-box">
        <p>
          <b>{t("dorean_paralavi")}</b>
        </p>
        <p>{t("dorean_courier", { amount: FREE_SHIPPING_THRESHOLD_NET })}</p>
      </div>
      <ContentMeta locale={locale} greekOnly />
      <Blocks blocks={SHIPPING} />
    </HdcContentPage>
  );
}
