import "server-only";
import { chargeableWeight } from "@/lib/shipping/acs-tariff";
import { renderEmail } from "@/lib/mail/hdc/render";
import { t } from "@/lib/mail/hdc/strings";
import { renderAndDeliver } from "@/lib/mail/hdc/deliver";
import { buildOrderView, loadOrder, orderLocale, type OrderRef } from "@/lib/mail/hdc/order-view";
import type { MailOptions } from "@/lib/mail/order-email";
import { trackingFor } from "@/lib/shipping/tracking";

/**
 * «Your order has shipped» — the tracking number is the message: large, above
 * the fold, with the tracking button under it.
 */

export async function buildShippedEmail(orderNumber: OrderRef, voucherNo: string, options: MailOptions = {}) {
  const order = await loadOrder(orderNumber);
  if (!order) return null;
  const locale = options.locale ?? orderLocale(order);
  const view = await buildOrderView(order, locale, { prices: false });

  /* The same weight that was declared to ACS and priced at checkout. */
  const weight = chargeableWeight(
    order.lines.map((line) => ({
      quantity: line.quantity,
      weight: line.weightKg == null ? null : Number(line.weightKg),
      width: null,
      length: null,
      height: null,
    })),
  );
  const kg = new Intl.NumberFormat(locale === "en" ? "en-GB" : locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(weight.chargeableKg);

  /* ACS, or DHL Express abroad with HDCtool's tracking link (docs/dhl-express.md §3). */
  const tracking = trackingFor(order, voucherNo);
  const carrierWord = tracking.carrier === "DHL" ? "DHL Express" : "ACS";
  const stored = (order.shippingQuote as { etaDays?: unknown } | null)?.etaDays;
  const days = Number(stored);
  const eta =
    tracking.carrier === "DHL" && typeof stored === "string"
      ? t(locale, "eta.range", { range: stored })
      : Number.isFinite(days) && days > 0
      ? days === 1
        ? t(locale, "shipped.eta_day")
        : t(locale, "shipped.eta_days", { n: days })
      : t(locale, "shipped.eta_default");

  const email = renderEmail({
    template: "order-shipped",
    locale,
    kind: "order",
    subject: t(locale, "shipped.subject", { number: order.orderNumber }),
    preheader:
      Number.isFinite(days) && days > 0
        ? t(locale, "shipped.pre_eta", { voucher: voucherNo, eta, carrier: carrierWord })
        : t(locale, "shipped.pre", { voucher: voucherNo, carrier: carrierWord }),
    topline: { left: t(locale, "shipped.topline"), right: order.orderNumber },
    assetOrigin: options.assetOrigin,
    data: {
      order: { ...view, cols: view.cols.slice(0, 1) },
      shipment: {
        tracking: voucherNo,
        tracking_url: tracking.url,
        /* «ACS» exactly as before; «DHL Express» for a parcel abroad. */
        carrier: carrierWord,
        rows: [
          {
            label: t(locale, "shipped.courier"),
            value: tracking.courier,
          },
          { label: t(locale, "shipped.eta"), value: eta, strong: true },
          /* One voucher per order — `createVoucherForOrder` enforces it. */
          { label: t(locale, "shipped.packages"), value: "1" },
          { label: t(locale, "shipped.weight"), value: `${kg} kg` },
          {
            label: t(locale, "shipped.document"),
            value: t(locale, order.wantsInvoice ? "doc.invoice" : "doc.receipt"),
          },
        ],
      },
    },
  });
  return { to: order.email, email };
}

export async function sendShippedEmail(orderNumber: string, voucherNo: string) {
  return renderAndDeliver(
    () => buildShippedEmail(orderNumber, voucherNo),
    `order-shipped ${orderNumber}`,
    "Η παραγγελία δεν βρέθηκε.",
  );
}
