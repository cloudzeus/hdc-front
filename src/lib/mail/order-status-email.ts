import "server-only";
import { renderEmail } from "@/lib/mail/hdc/render";
import { t } from "@/lib/mail/hdc/strings";
import { deliver, renderAndDeliver } from "@/lib/mail/hdc/deliver";
import { buildOrderView, loadOrder, orderLocale, type OrderRef } from "@/lib/mail/hdc/order-view";
import { buildInternalStatusEmail } from "@/lib/mail/order-internal-email";
import type { MailOptions } from "@/lib/mail/order-email";

/**
 * «Your order moved on.»
 *
 * Triggered by HDCtool when the order's status changes in SoftOne
 * (`SALDOC.FINSTATES`). The status name is the one the shop gave it in the
 * ERP, printed as is: two wordings for one status make the customer call to
 * ask which one is true.
 *
 * Two emails: the customer's, in their language, and a Greek one for the shop
 * (it used to be a copy of the customer's, which an English order would have
 * made unreadable to the shop). Replies to the customer's go to
 * `MAIL_REPLY_TO`, where somebody reads them.
 */

export type OrderStatusMailOutcome = { ok: true; id: string } | { ok: false; error: string };

function trackingUrl(voucherNo: string): string {
  return `https://www.acscourier.net/el/track-and-trace/?paramtracknr=${encodeURIComponent(voucherNo)}`;
}

export async function buildOrderStatusEmail(orderNumber: OrderRef, statusName: string, options: MailOptions = {}) {
  const order = await loadOrder(orderNumber);
  if (!order) return null;
  const locale = options.locale ?? orderLocale(order);
  const view = await buildOrderView(order, locale);

  const email = renderEmail({
    template: "order-status",
    locale,
    kind: "order",
    subject: t(locale, "status.subject", { number: order.orderNumber, status: statusName }),
    preheader: t(locale, "status.pre", { number: order.orderNumber, status: statusName }),
    topline: { left: t(locale, "status.topline"), right: order.orderNumber },
    assetOrigin: options.assetOrigin,
    data: {
      order: view,
      status: {
        name: statusName,
        tracking: order.acsVoucherNo ?? "",
        tracking_url: order.acsVoucherNo ? trackingUrl(order.acsVoucherNo) : "",
      },
    },
  });
  return { to: order.email, email };
}

export async function sendOrderStatusEmail(
  orderNumber: string,
  statusName: string,
): Promise<OrderStatusMailOutcome> {
  const name = statusName.trim();
  if (!name) return { ok: false, error: "Λείπει η ονομασία της κατάστασης." };

  const customer = await renderAndDeliver(
    () => buildOrderStatusEmail(orderNumber, name),
    `order-status ${orderNumber}`,
    "Η παραγγελία δεν βρέθηκε.",
  );

  // The shop's copy never decides the outcome: the customer's email is the event.
  try {
    const internal = await buildInternalStatusEmail(orderNumber, name);
    if (internal) await deliver(internal.email, internal, `internal-status ${orderNumber}`);
  } catch (error) {
    console.error(`[mail] internal-status ${orderNumber}:`, error);
  }

  return customer;
}
