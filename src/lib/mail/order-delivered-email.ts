import "server-only";
import { renderEmail } from "@/lib/mail/hdc/render";
import { t } from "@/lib/mail/hdc/strings";
import { renderAndDeliver } from "@/lib/mail/hdc/deliver";
import { buildOrderView, loadOrder, orderLocale, stamp } from "@/lib/mail/hdc/order-view";
import type { MailOptions } from "@/lib/mail/order-email";

/**
 * «Your order has been delivered.»
 *
 * Asks for the items to be checked while returns are still easy, and promises
 * no PDF document: there is none anywhere in the shop or in HDCtool, and a
 * «download your receipt» button that ends in a 404 is worse than none. The
 * buttons go to the order page, where everything we keep is.
 *
 * ACS also returns who signed for the parcel; it is not written here — it is
 * a third person's name, often a neighbour's.
 */

export async function buildDeliveredEmail(orderNumber: string, options: MailOptions = {}) {
  const order = await loadOrder(orderNumber);
  if (!order) return null;
  const locale = options.locale ?? orderLocale(order);
  const view = await buildOrderView(order, locale, { prices: false });

  const email = renderEmail({
    template: "order-delivered",
    locale,
    kind: "order",
    subject: t(locale, "delivered.subject", { number: order.orderNumber }),
    preheader: t(locale, "delivered.pre"),
    topline: { left: t(locale, "delivered.topline"), right: order.orderNumber },
    assetOrigin: options.assetOrigin,
    data: {
      order: view,
      delivery: {
        rows: [
          { label: t(locale, "delivered.at"), value: stamp(order.deliveredAt ?? new Date()), strong: true },
          {
            label: t(locale, "delivered.where"),
            value: `${order.shipLine1}, ${order.shipPostcode} ${order.shipCity}`,
          },
        ],
      },
    },
  });
  return { to: order.email, email };
}

export async function sendDeliveredEmail(orderNumber: string) {
  return renderAndDeliver(
    () => buildDeliveredEmail(orderNumber),
    `order-delivered ${orderNumber}`,
    "Η παραγγελία δεν βρέθηκε.",
  );
}
