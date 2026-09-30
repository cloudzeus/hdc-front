import "server-only";
import { paymentPageUrl } from "@/lib/payment/viva";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/routing";
import { holdHours } from "@/lib/orders/hold";
import { renderEmail } from "@/lib/mail/hdc/render";
import { t } from "@/lib/mail/hdc/strings";
import { renderAndDeliver } from "@/lib/mail/hdc/deliver";
import {
  buildOrderView,
  loadOrder,
  orderLocale,
  paymentLabel,
  stamp,
  type OrderRef,
} from "@/lib/mail/hdc/order-view";

/**
 * The customer's order email: confirmation, bank-transfer details, or the
 * receipt of a payment that arrived later.
 *
 * ── One event, one email ───────────────────────────────────────────────────
 *
 *   • placed, awaiting a bank transfer → confirmation with the transfer details
 *   • paid by card at checkout (webhook) → confirmation, «paid»
 *   • paid later, after an email already went out (a bank-transfer order paid
 *     by card, or a postage correction paid) → `payment-success`, a receipt
 *     without the whole order again
 *
 * ── Bank details are configuration ─────────────────────────────────────────
 *
 * `BANK_TRANSFER_IBAN` and its siblings. An IBAN in the code is one typo away
 * from sending somebody's money to a stranger. Without one there is no
 * transfer email: the confirmation goes out and the gap shouts in the logs.
 */

const BANK = {
  holder: process.env.BANK_TRANSFER_HOLDER ?? "",
  iban: process.env.BANK_TRANSFER_IBAN ?? "",
  bank: process.env.BANK_TRANSFER_BANK ?? "",
};

export type MailOptions = { locale?: Locale; assetOrigin?: string };

/** For the admin preview: show a variant the real order does not have. */
export type OrderPreviewVariant = { receipt?: boolean; supplier?: boolean };
export type OrderEmailOutcome = { ok: true; id: string } | { ok: false; error: string };

/** Which email a payment should produce: the receipt, when the order was already confirmed by email. */
function alreadyConfirmed(order: { paymentMethod: string; shippingQuote: unknown }): boolean {
  const corrected = Boolean((order.shippingQuote as { correction?: unknown } | null)?.correction);
  return order.paymentMethod === "bank" || corrected;
}

export async function buildOrderEmail(
  orderNumber: OrderRef,
  options: MailOptions & { trigger?: "placed" | "payment"; preview?: OrderPreviewVariant } = {},
) {
  const order = await loadOrder(orderNumber);
  if (!order) return null;
  const locale = options.locale ?? orderLocale(order);
  const money = (n: unknown) => formatMoney(Number(n), locale);
  const view = await buildOrderView(order, locale);
  if (options.preview?.supplier) view.supplier = true;
  const count = order.lines.length;
  const total = money(order.totalGross);

  if (options.preview?.receipt || (options.trigger === "payment" && view.paid && alreadyConfirmed(order))) {
    const method = paymentLabel(locale, order.paymentMethod);
    const email = renderEmail({
      template: "payment-success",
      locale,
      kind: "order",
      subject: t(locale, "paid.subject", { number: order.orderNumber }),
      preheader: t(locale, "paid.pre", { amount: total, method }),
      topline: { left: t(locale, "paid.topline"), right: order.orderNumber },
      assetOrigin: options.assetOrigin,
      data: {
        order: view,
        payment: {
          rows: [
            { label: t(locale, "order.number"), value: order.orderNumber, strong: true },
            { label: t(locale, "paid.amount"), value: total, strong: true },
            { label: t(locale, "paid.method"), value: method },
            { label: t(locale, "paid.date"), value: stamp(order.paidAt ?? new Date()) },
          ],
        },
      },
    });
    return { to: order.email, email, bcc: process.env.MAIL_BCC };
  }

  /*
   * The reference the customer writes on the transfer: Viva's order code where
   * there is one, so Viva itself matches the transfer and the webhook marks
   * the order paid; the order number otherwise.
   */
  const reference = order.vivaOrderCode || order.orderNumber;
  const awaitingTransfer = !view.paid && order.paymentMethod === "bank";
  const useBank = awaitingTransfer && BANK.iban.trim().length > 0;
  if (awaitingTransfer && !useBank) {
    console.error(
      `[order-email] ${order.orderNumber}: αναμονή κατάθεσης χωρίς BANK_TRANSFER_IBAN: στάλθηκε επιβεβαίωση χωρίς στοιχεία κατάθεσης.`,
    );
  }

  const heldHours = order.reservedUntil ? holdHours(order.createdAt, order.reservedUntil) : null;
  const bank = useBank
    ? {
        rows: [
          ...(BANK.bank ? [{ label: t(locale, "bank.bank"), value: BANK.bank }] : []),
          ...(BANK.holder ? [{ label: t(locale, "bank.holder"), value: BANK.holder }] : []),
          { label: t(locale, "bank.iban"), value: BANK.iban, strong: true },
          { label: t(locale, "bank.amount"), value: total, strong: true },
          { label: t(locale, "bank.reference"), value: reference, strong: true },
        ],
        hold: order.reservedUntil
          ? t(locale, "bank.hold_deadline", { deadline: stamp(order.reservedUntil) })
          : t(locale, "bank.hold", {
              time: heldHours ? t(locale, "time.hours", { n: heldHours }) : t(locale, "time.working_days"),
            }),
        card_url: order.vivaOrderCode ? paymentPageUrl(order.vivaOrderCode) : "",
      }
    : null;

  const leadKey = view.paid
    ? order.shippingMethod === "pickup"
      ? "confirm.lead_paid_pickup"
      : "confirm.lead_paid"
    : useBank
      ? "confirm.lead_bank"
      : "confirm.lead_pending";

  const email = renderEmail({
    template: "order-confirmation",
    locale,
    kind: "order",
    subject: useBank
      ? t(locale, "confirm.subject_bank", { number: order.orderNumber })
      : view.paid
        ? t(locale, "confirm.subject_paid", { number: order.orderNumber })
        : t(locale, "confirm.subject", { number: order.orderNumber }),
    preheader: useBank
      ? t(locale, "confirm.pre_bank", { total, reference })
      : t(locale, view.paid ? "confirm.pre_paid" : "confirm.pre", { count, total }),
    topline: { left: t(locale, "confirm.topline"), right: order.orderNumber },
    assetOrigin: options.assetOrigin,
    data: { order: view, leadKey, bank },
  });

  return { to: order.email, email, bcc: process.env.MAIL_BCC };
}

/**
 * Send the order email. Reads the order afresh: it runs from the checkout and
 * from the payment webhook, which see the row at different stages.
 */
export async function sendOrderEmail(
  orderNumber: string,
  options: { trigger?: "placed" | "payment" } = {},
): Promise<OrderEmailOutcome> {
  return renderAndDeliver(
    () => buildOrderEmail(orderNumber, options),
    `order-email ${orderNumber}`,
    "Η παραγγελία δεν βρέθηκε.",
  );
}
