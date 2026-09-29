import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { SHOP } from "@/config/shop";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";
import { displayName } from "@/lib/milwaukee/display";
import { parseModel } from "@/lib/milwaukee/model";
import { holdHours } from "@/lib/orders/hold";
import { orderTimeline } from "@/lib/orders/timeline";

/**
 * The order confirmation — checkout.html, screen 3.
 *
 * Presentational: the route reads the order (and checks its token) and hands
 * over this plain shape, so the same component renders a real order and the
 * development preview's fixture.
 *
 * Everything shown is read from the order row: the timeline from its status
 * and payment status, the deposit box from its Viva code and `reservedUntil`,
 * the document from `wantsInvoice`. Nothing is promised that the shop does not
 * do yet — no PDF link for the document.
 */
export type ConfirmationOrder = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  shippingMethod: string;
  /** A line came from the supplier: the whole order ships in 3–5 working days. */
  supplierOrder: boolean;
  createdAt: Date;
  reservedUntil: Date | null;
  email: string;
  shipLine1: string;
  shipLine2: string | null;
  shipPostcode: string;
  shipCity: string;
  wantsInvoice: boolean;
  companyName: string | null;
  vatNumber: string | null;
  acsVoucherNo: string | null;
  subtotalGross: number;
  shippingGross: number;
  paymentFeeGross: number;
  vatAmount: number;
  totalGross: number;
  /** Viva's payment code, for a bank transfer still outstanding. */
  depositCode: string | null;
  /** Viva's payment page for that code. */
  payUrl: string | null;
  /** No account behind this order and nobody signed in. */
  isGuest: boolean;
  lines: Array<{
    id: string;
    name: string;
    quantity: number;
    lineGross: number;
    imageUrl: string | null;
    vatRate: number;
  }>;
};

export async function HdcOrderConfirmation({
  order,
  locale,
  extra,
}: {
  order: ConfirmationOrder;
  locale: Locale;
  /** Rendered under the summary (the reorder button on the real page). */
  extra?: React.ReactNode;
}) {
  const t = await getTranslations("epibebaiosi.Hdc");
  const money = (n: number) => formatMoney(n, locale);

  const tz = "Europe/Athens";
  const day = (d: Date) =>
    new Intl.DateTimeFormat(locale, { timeZone: tz, day: "numeric", month: "numeric" }).format(d);
  const time = (d: Date) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  const stamp = (d: Date) => `${day(d)} · ${time(d)}`;

  const pickup = order.shippingMethod === "pickup";
  const bank = order.paymentMethod === "bank";
  const awaitingOnline = !bank && order.paymentStatus === "PENDING";

  const payMethod =
    order.paymentMethod === "card"
      ? t("pay_card")
      : order.paymentMethod === "iris"
        ? t("pay_iris")
        : bank
          ? t("pay_bank")
          : order.paymentMethod;
  const payShort =
    order.paymentMethod === "card"
      ? t("pay_card_short")
      : order.paymentMethod === "iris"
        ? t("pay_iris_short")
        : t("pay_bank_short");

  const payState =
    order.paymentStatus === "PAID"
      ? t("exoflithike")
      : order.paymentStatus === "FAILED"
        ? t("apetyche")
        : order.paymentStatus === "REFUNDED"
          ? t("epistrafike")
          : t("se_anamoni");

  const timeline = orderTimeline(order).map((step) => {
    switch (step.key) {
      case "placed":
        return { ...step, label: t("tl_placed"), sub: stamp(order.createdAt) };
      case "paid":
        return {
          ...step,
          label: step.state === "failed" ? t("tl_not_paid") : t("tl_paid"),
          sub: step.state === "done" ? payShort : step.state === "failed" ? payState : t("tl_waiting"),
        };
      case "preparing":
        return {
          ...step,
          label: t("tl_preparing"),
          sub: t("tl_in_shop"),
        };
      default:
        return {
          ...step,
          label: pickup ? t("tl_ready") : t("tl_shipped"),
          sub: pickup
            ? t("tl_ready_sub")
            : order.acsVoucherNo
              ? `ACS ${order.acsVoucherNo}`
              : t("tl_shipped_sub"),
        };
    }
  });

  const miniName = (name: string) => {
    const model = parseModel(name);
    return model
      ? `${model.code} — ${model.content === "kit" ? t("kit") : t("sketo")}`
      : displayName(name);
  };

  const shipCost = order.shippingGross === 0 ? t("dorean_mikra") : money(order.shippingGross);
  const allAt24 = order.lines.every((l) => l.vatRate === 24);

  return (
    <div className="hdc-wrap hdc-ok">
      <div className="hdc-ok-main">
        <div className="okhead">
          <h1 className="hdc-disp">
            {awaitingOnline ? (
              t("kratithike")
            ) : (
              <>
                {t("eycharistoume")}
                <br />
                {t("kataxorithike")}
              </>
            )}
          </h1>
          <p>
            {awaitingOnline
              ? t("text_awaiting", { email: order.email })
              : pickup
                ? t("text_pickup", { email: order.email })
                : t("text_courier", { email: order.email })}
          </p>
          {order.supplierOrder && <p className="hdc-notice">{t("olokliri_3_5")}</p>}
          <span className="num">{order.orderNumber}</span>
        </div>

        <ol className="hdc-tl">
          {timeline.map((step) => (
            <li key={step.key} data-state={step.state}>
              <b>
                {step.state === "done" ? "✓ " : ""}
                {step.label}
              </b>
              <span>{step.sub}</span>
            </li>
          ))}
        </ol>

        <div className="hdc-det">
          <div>
            <h2>{t("apostoli")}</h2>
            <p>
              {pickup ? t("paralavi_katastima") : order.shippingMethod === "express" ? "ACS Express" : "ACS Courier"}
              {" — "}
              {shipCost}
              <br />
              {pickup ? SHOP.contact.street : order.shipLine1}
              {!pickup && order.shipLine2 && <>, {order.shipLine2}</>}
              <br />
              {pickup
                ? `${SHOP.contact.postcode} ${SHOP.contact.city}`
                : `${order.shipPostcode} ${order.shipCity}`}
            </p>
          </div>
          <div>
            <h2>{t("pliromi")}</h2>
            <p>
              {payMethod}
              <br />
              {money(order.totalGross)} — {payState}
            </p>
          </div>
          <div>
            <h2>{t("parastatiko")}</h2>
            <p>
              {order.wantsInvoice ? (
                <>
                  {t("timologio")}
                  {order.companyName && (
                    <>
                      <br />
                      {order.companyName}
                    </>
                  )}
                  {order.vatNumber && (
                    <>
                      <br />
                      {t("afm", { afm: order.vatNumber })}
                    </>
                  )}
                </>
              ) : (
                t("apodeixi")
              )}
            </p>
          </div>
        </div>

        {bank && order.paymentStatus === "PENDING" && (
          <div className="hdc-bank">
            <h2>{t("bank_title")}</h2>
            <p>
              {order.reservedUntil
                ? t("bank_text", { hours: holdHours(order.createdAt, order.reservedUntil) })
                : t("bank_text_nohold")}
            </p>
            <dl>
              <dt>{t("bank_code")}</dt>
              <dd className="code">
                {order.depositCode ?? t("bank_no_code", { order: order.orderNumber })}
              </dd>
              <dt>{t("bank_amount")}</dt>
              <dd>{money(order.totalGross)}</dd>
              {order.reservedUntil && (
                <>
                  <dt>{t("bank_until")}</dt>
                  <dd>{stamp(order.reservedUntil)}</dd>
                </>
              )}
            </dl>
            {order.payUrl && (
              <a
                href={order.payUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hdc-btn hdc-btn-ink pay"
              >
                {t("pliroste_online")} →
              </a>
            )}
          </div>
        )}

        <div className="hdc-ok-acts">
          <Link href="/katalogos" className="hdc-btn hdc-btn-red hdc-btn-lg">
            {t("synecheia_agoron")}
          </Link>
          {order.isGuest && (
            <Link href="/eggrafi" className="hdc-btn hdc-btn-line hdc-btn-lg">
              {t("dimiourgia_logariasmou")}
            </Link>
          )}
        </div>
      </div>

      <aside className="hdc-sum hdc-ok-sum">
        <h2 className="hdc-disp">{t("proionta")}</h2>
        <div className="in hdc-sum-body">
          <ul className="hdc-mini">
            {order.lines.map((line) => (
              <li key={line.id}>
                <span className="im">
                  {line.imageUrl && (
                    <Image src={line.imageUrl} alt="" width={64} height={64} sizes="64px" />
                  )}
                  <em>{line.quantity}</em>
                </span>
                <b>{miniName(line.name)}</b>
                <span className="p">{money(line.lineGross)}</span>
              </li>
            ))}
          </ul>
          <dl>
            <div>
              <dt>{t("proionta_row")}</dt>
              <dd>{money(order.subtotalGross)}</dd>
            </div>
            <div>
              <dt>{t("metaforika")}</dt>
              <dd className={order.shippingGross === 0 ? "fr" : undefined}>
                {order.shippingGross === 0 ? t("dorean") : money(order.shippingGross)}
              </dd>
            </div>
            {order.paymentFeeGross > 0 && (
              <div>
                <dt>{t("epivarynsi")}</dt>
                <dd>{money(order.paymentFeeGross)}</dd>
              </div>
            )}
          </dl>
          <div className="tot">
            <b>{t("synolo")}</b>
            <span>{money(order.totalGross)}</span>
          </div>
          <p className="vat">
            {allAt24
              ? t("periechei_fpa_24", { amount: money(order.vatAmount) })
              : t("periechei_fpa", { amount: money(order.vatAmount) })}
          </p>
          {extra}
        </div>
      </aside>
    </div>
  );
}
