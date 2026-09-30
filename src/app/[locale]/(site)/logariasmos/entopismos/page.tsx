import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { OrderTracker } from "@/components/orders/OrderTracker";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { upGreek } from "@/lib/greek";
import { PRIMARY_PHONE } from "@/config/shop";
import { indexingAllowed } from "@/lib/seo/indexing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "entopismos.page" });
  return {
    title: t("titlos_entopismos_paraggelias"),
    description: t("perigrafi_deite_poy_vrisketai_i"),
    // Indexable once the shop is live; until then it follows the site-wide block.
    robots: indexingAllowed() ? { index: true, follow: true } : { index: false, follow: false },
  };
}

/**
 * Order tracking.
 *
 * The one account sub-route that works WITHOUT an account, and the reason it
 * ships before the rest of the account area: it needs nothing from HDCtool.
 * The order, its lines and its status history are all in this database, written
 * by our own checkout.
 *
 * The ACS voucher appears once the parcel is handed over, linking out to the
 * courier's own tracking — the live scan events need H6, which is not wired.
 */
export default async function TrackOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("entopismos.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const raw = await searchParams;
  // Deep-linkable from the confirmation email: `?order=HDC-…` prefills the field.
  const initial = (Array.isArray(raw.order) ? raw.order[0] : raw.order)?.trim();

  return (
    <AccountChrome locale={locale}>
      <main id="main" className="hdc-acc-page">
        <div className="hdc-acbar hdc-acbar--keep">
          <div className="hdc-wrap">
            <div>
              <h1 className="hdc-disp">{upGreek(t("poy_einai_i_paraggelia_moy"))}</h1>
              <p>{upGreek(t("entopismos_paraggelias"))}</p>
            </div>
          </div>
        </div>
        <div className="hdc-wrap hdc-track-page">
          <section className="hdc-box">
            <h2 className="hdc-disp">{upGreek(t("entopismos_paraggelias"))}</h2>
            <div className="hdc-box-body">
              <p className="hdc-lead hdc-lead--box">{t("arithmos_paraggelias_kai_to_email")}</p>
              <OrderTracker initialOrderNumber={initial} />
            </div>
          </section>
          <section className="hdc-box">
            <h2 className="hdc-disp">{upGreek(t("den_vriskete_ton_arithmo"))}</h2>
            <div className="hdc-box-body">
              <p className="hdc-lead hdc-lead--box">{t("einai_sto_email_epivevaiosis_sti")}</p>
              <div className="hdc-btn-row">
                <a href={`tel:${PRIMARY_PHONE.e164}`} className="hdc-btn hdc-btn-ink">
                  {PRIMARY_PHONE.display}
                </a>
                <Link href="/syxnes-erotiseis#apostoli" className="hdc-btn hdc-btn-line">
                  {upGreek(t("erotiseis_apostolis"))}
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </AccountChrome>
  );
}
