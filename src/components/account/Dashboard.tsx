import { getTranslations } from "next-intl/server";
import { MyToolsBox, OrderRows, TrackStrip } from "@/components/account/HdcAccountParts";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { AccountDashboard } from "@/lib/account/dashboard";
import { formatMoney } from "@/lib/format";
import { upGreek } from "@/lib/greek";

/**
 * The account overview's main column (account.html, screen 2), in the order
 * the customer comes for it: where is my parcel, what did I buy, change
 * something.
 *
 * The parcel strip is there only when a parcel is on its way — never a «no
 * active shipments» placeholder, because an empty state that shows more often
 * than the real thing trains people to ignore the space. «ΤΑ ΕΡΓΑΛΕΙΑ ΜΟΥ» is
 * there only when the customer owns something on a battery platform.
 */
export async function Dashboard({
  data,
  locale,
  catalogueHref,
  before,
}: {
  data: AccountDashboard;
  locale: Locale;
  catalogueHref: string;
  /** Rendered after the parcel strip (the email-proof panel). */
  before?: React.ReactNode;
}) {
  const t = await getTranslations("account.Hdc");
  const money = (n: number) => formatMoney(n, locale);
  const year = new Date().getFullYear();

  return (
    <>
      {data.tracking && <TrackStrip tracking={data.tracking} locale={locale} />}
      {before}

      <dl className="hdc-stats">
        <div>
          <dt>{t("stat_orders")}</dt>
          <dd>{data.counts.total}</dd>
        </div>
        <div data-hl={data.counts.open > 0 ? "" : undefined}>
          <dt>{t("stat_open")}</dt>
          <dd>{data.counts.open}</dd>
        </div>
        <div>
          <dt>{t("stat_delivered")}</dt>
          <dd>{data.counts.delivered}</dd>
        </div>
        <div>
          <dt>{t("stat_year", { year })}</dt>
          <dd>{money(data.spend.year)}</dd>
        </div>
      </dl>

      {data.tools.length > 0 && <MyToolsBox tools={data.tools} catalogueHref={catalogueHref} all />}

      <section className="hdc-box hdc-recent">
        <h2 className="hdc-disp">
          {t("prosfates_paraggelies")}
          {data.counts.total > 0 && <Link href="/logariasmos/paraggelies">{t("oles")} →</Link>}
        </h2>
        {data.orders.length === 0 ? (
          <div className="hdc-empty">
            <p>{t("kamia_paraggelia")}</p>
            <p>{t("kamia_paraggelia_body")}</p>
            <Link href="/katalogos" className="hdc-btn hdc-btn-red">
              {t("ston_katalogo")}
            </Link>
          </div>
        ) : (
          <OrderRows orders={data.orders} locale={locale} />
        )}
      </section>

      <div className="hdc-two">
        <section className="hdc-box">
          <h2 className="hdc-disp">
            {t("dieuthynsi_paradosis")}
            <Link href="/logariasmos/dieuthynseis">{data.address ? t("allagi") : t("prosthiki")}</Link>
          </h2>
          <div className="hdc-addr">
            {data.address ? (
              <>
                <b>{upGreek(data.address.label)}</b>
                <br />
                {data.address.line1}
                {data.address.line2 ? `, ${data.address.line2}` : ""}
                <br />
                {data.address.postcode} {data.address.city}
                {data.addressCount > 1 && (
                  <>
                    <br />
                    <span className="more">{t("n_akomi_apothikeumenes", { count: data.addressCount - 1 })}</span>
                  </>
                )}
              </>
            ) : (
              <span className="more">{t("choris_dieuthynsi")}</span>
            )}
          </div>
        </section>
        <section className="hdc-box hdc-qa">
          <h2 className="hdc-disp">{t("grigores_energeies")}</h2>
          <Link href="/logariasmos/paraggelies">{t("qa_orders")}</Link>
          <Link href="/logariasmos/stoicheia">{t("qa_details")}</Link>
          <Link href="/epistrofes">{t("qa_return")}</Link>
          <Link href="/epikoinonia">{t("qa_contact")}</Link>
        </section>
      </div>
    </>
  );
}
