import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HdcContentPage } from "@/components/content/HdcContentPage";
import { PRIMARY_PHONE, SHOP } from "@/config/shop";
import type { Locale } from "@/i18n/routing";
import { contentMetadata } from "@/lib/content/page-meta";

/**
 * Warranties. There is no HDC source text yet, so this says only what is
 * certain: Milwaukee products carry the manufacturer's warranty, and the store
 * handles warranty support. No durations, no registration or extended-warranty
 * claims until the client supplies the wording.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "content" });
  return contentMetadata({
    path: "/eggyiseis",
    locale,
    title: t("t_eggyiseis"),
    description: t("lead_eggyiseis"),
  });
}

export default async function WarrantyPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("content");

  return (
    <HdcContentPage locale={locale} title={t("t_eggyiseis")} lead={t("lead_eggyiseis")}>
      <div className="hdc-prose">
        <p>{t("eggyisi_p1")}</p>
        <h2>{t("eggyisi_h_ypostirixi")}</h2>
        <p>{t("eggyisi_p2")}</p>
        <ul>
          <li>
            {t("tilefono")}: <a href={`tel:${PRIMARY_PHONE.e164}`}>{PRIMARY_PHONE.display}</a>
          </li>
          <li>
            Email: <a href={`mailto:${SHOP.contact.email}`}>{SHOP.contact.email}</a>
          </li>
          <li>
            {t("dieythynsi")}: {SHOP.contact.address}
          </li>
        </ul>
        <p>{t("eggyisi_p3")}</p>
      </div>
    </HdcContentPage>
  );
}
