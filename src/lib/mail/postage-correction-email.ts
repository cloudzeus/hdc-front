import "server-only";
import { formatMoney } from "@/lib/format";
import { siteOrigin } from "@/lib/seo/urls";
import { renderEmail } from "@/lib/mail/hdc/render";
import { t } from "@/lib/mail/hdc/strings";
import { renderAndDeliver } from "@/lib/mail/hdc/deliver";
import { loadOrder, orderLocale } from "@/lib/mail/hdc/order-view";
import type { MailOptions } from "@/lib/mail/order-email";

/**
 * «Sorry for our mistake» — the corrected price, and a way to pay it.
 *
 * Sent by an operator after the postage of an unpaid order was re-priced. It
 * owns the mistake in plain words, shows the old figures struck through next to
 * the new ones, and links to `/api/payment/pay/…`, which opens a Viva payment
 * for whatever the order holds at the moment of the click — so the button
 * still works when the email is read the next day.
 */

export type PostageCorrection = { previousShippingGross: number; previousTotalGross: number; message?: string };

export async function buildPostageCorrectionEmail(
  orderNumber: string,
  correction: PostageCorrection,
  options: MailOptions = {},
) {
  const order = await loadOrder(orderNumber);
  if (!order) return null;
  const locale = options.locale ?? orderLocale(order);
  const money = (n: number) => formatMoney(n, locale);
  const payUrl = `${siteOrigin()}/api/payment/pay/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(order.guestToken)}`;
  const message = correction.message?.trim().slice(0, 1500) || "";

  const email = renderEmail({
    template: "order-price-correction",
    locale,
    kind: "order",
    subject: t(locale, "correction.subject", { number: order.orderNumber }),
    preheader: t(locale, "correction.pre", { total: money(Number(order.totalGross)) }),
    topline: { left: t(locale, "correction.topline"), right: order.orderNumber },
    assetOrigin: options.assetOrigin,
    data: {
      order: { number: order.orderNumber },
      correction: {
        previous_shipping: money(correction.previousShippingGross),
        shipping: money(Number(order.shippingGross)),
        message,
        rows: [
          { label: t(locale, "correction.products"), value: money(Number(order.subtotalGross)) },
          { label: t(locale, "correction.shipping_old"), value: money(correction.previousShippingGross), strike: true },
          { label: t(locale, "correction.shipping_new"), value: money(Number(order.shippingGross)), strong: true },
          { label: t(locale, "correction.total_old"), value: money(correction.previousTotalGross), strike: true },
          { label: t(locale, "correction.total_new"), value: money(Number(order.totalGross)), strong: true },
        ],
      },
      payment: { pay_url: payUrl },
    },
  });
  return { to: order.email, email };
}

export async function sendPostageCorrectionEmail(orderNumber: string, correction: PostageCorrection) {
  return renderAndDeliver(
    () => buildPostageCorrectionEmail(orderNumber, correction),
    `postage-correction ${orderNumber}`,
    "Η παραγγελία δεν βρέθηκε.",
  );
}
