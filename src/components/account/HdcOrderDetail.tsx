import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { dayMonth, shippingLabel, StatusChip } from "@/components/account/HdcAccountParts";
import { ReorderButton } from "@/components/account/ReorderButton";
import { SHOP } from "@/config/shop";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { AccountOrderDetail } from "@/lib/account/orders";
import { articleNumber } from "@/lib/account/order-view";
import { formatMoney } from "@/lib/format";
import { displayName } from "@/lib/milwaukee/display";
import { parseModel } from "@/lib/milwaukee/model";

/**
 * One order — account.html, screen 3: everything a question or a return
 * needs, on one screen.
 *
 * No «ΠΑΡΑΣΤΑΤΙΚΟ PDF» button: the stamped document needs a read-only HDCtool
 * endpoint that does not exist yet, and a button that cannot deliver is worse
 * than none. Presentational — the route checks the order is the customer's.
 */
export async function HdcOrderDetail({ order, locale }: { order: AccountOrderDetail; locale: Locale }) {
  const t = await getTranslations("account.Hdc");
  const money = (n: number) => formatMoney(n, locale);
  const longDate = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Athens",
  }).format(order.createdAt);
  const shortDay = (d: Date) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "Europe/Athens" }).format(d);

  const pickup = order.shippingMethod === "pickup";
  const statusDate =
    order.status === "DELIVERED" ? order.deliveredAt : order.status === "SHIPPED" ? order.shippedAt : null;

  const payMethod =
    order.paymentMethod === "card"
      ? t("pay_card")
      : order.paymentMethod === "iris"
        ? "IRIS"
        : order.paymentMethod === "bank"
          ? t("pay_bank")
          : order.paymentMethod === "paypal"
            ? "PayPal"
            : order.paymentMethod;
  const payState =
    order.paymentStatus === "PAID"
      ? order.paidAt
        ? t("exoflithike_stis", { date: dayMonth(order.paidAt, locale) })
        : t("exoflithike")
      : order.paymentStatus === "REFUNDED"
        ? t("epistrafike")
        : order.paymentStatus === "FAILED"
          ? t("apetyche")
          : order.paymentStatus === "ON_DELIVERY"
            ? t("me_tin_paradosi")
            : t("se_anamoni");

  const content = (name: string) => {
    const model = parseModel(name);
    return model ? (model.content === "kit" ? t("kit") : t("sketo")) : null;
  };
  const allAt24 = order.lines.every((l) => l.vatRate === 24);

  return (
    <>
      <Link href="/logariasmos/paraggelies" className="hdc-back">
        ← {t("oles_oi_paraggelies")}
      </Link>
      <article className="hdc-od">
        <div className="h">
          <div>
            <h2 className="hdc-disp">{order.orderNumber}</h2>
            <p>
              {longDate} · <StatusChip status={order.status} shippingMethod={order.shippingMethod} />
              {statusDate && ` ${t("stis", { date: shortDay(statusDate) })}`}
            </p>
          </div>
          <div className="acts">
            <ReorderButton orderNumber={order.orderNumber} token={order.guestToken} locale={locale} />
            <Link href="/epistrofes" className="hdc-btn hdc-btn-line">
              {t("epistrofi")}
            </Link>
          </div>
        </div>

        {order.lines.map((line) => {
          const code = articleNumber(line.name, line.sku);
          const kind = content(line.name);
          return (
            <div key={line.id} className="ln">
              <div className="im">
                {line.imageUrl && <Image src={line.imageUrl} alt="" width={72} height={72} sizes="72px" />}
              </div>
              <div className="nm">
                <b>{displayName(line.name, code)}</b>
                <span>
                  {code}
                  {kind && ` · ${kind}`}
                </span>
              </div>
              <div className="q">× {line.quantity}</div>
              <div className="p">{money(line.lineGross)}</div>
            </div>
          );
        })}

        <div className="ft">
          <div>
            <h4>{t("apostoli")}</h4>
            {await shippingLabel(order.shippingMethod)} —{" "}
            {order.shippingGross === 0 ? t("dorean_mikra") : money(order.shippingGross)}
            <br />
            {pickup
              ? `${SHOP.contact.street}, ${SHOP.contact.postcode} ${SHOP.contact.city}`
              : `${order.shipLine1}${order.shipLine2 ? `, ${order.shipLine2}` : ""}, ${order.shipPostcode} ${order.shipCity}`}
            {order.acsVoucherNo && (
              <>
                <br />
                <span className="cond r">
                  ACS {order.acsVoucherNo}
                  {order.deliveredAt && ` — ${t("paradothike_stis", { date: dayMonth(order.deliveredAt, locale) })}`}
                </span>
              </>
            )}
          </div>
          <div>
            <h4>{t("pliromi")}</h4>
            {payMethod}
            <br />
            {payState}
          </div>
          <div>
            <h4>{t("parastatiko")}</h4>
            {order.wantsInvoice ? t("timologio") : t("apodeixi")}
            {order.wantsInvoice && order.companyName && (
              <>
                <br />
                {order.companyName}
              </>
            )}
            {order.wantsInvoice && order.vatNumber && (
              <>
                <br />
                <span className="cond">{t("afm", { afm: order.vatNumber })}</span>
              </>
            )}
            {order.documentNo && (
              <>
                <br />
                <span className="cond">{t("ar_parastatikou", { no: order.documentNo })}</span>
              </>
            )}
          </div>
          <div>
            <dl>
              <dt>{t("proionta")}</dt>
              <dd>{money(order.subtotalGross)}</dd>
              <dt>{t("metaforika")}</dt>
              <dd className={order.shippingGross === 0 ? "fr" : undefined}>
                {order.shippingGross === 0 ? t("dorean") : money(order.shippingGross)}
              </dd>
              {order.paymentFeeGross > 0 && (
                <>
                  <dt>{t("epivarynsi")}</dt>
                  <dd>{money(order.paymentFeeGross)}</dd>
                </>
              )}
              <dt>{allAt24 ? t("fpa_24") : t("fpa")}</dt>
              <dd>{money(order.vatAmount)}</dd>
              <dt className="tot">{t("synolo")}</dt>
              <dd className="tot">{money(order.totalGross)}</dd>
            </dl>
          </div>
        </div>
      </article>
    </>
  );
}
