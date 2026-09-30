import "server-only";
import { paymentPageUrl } from "@/lib/payment/viva";
import { formatMoney } from "@/lib/format";
import { renderEmail } from "@/lib/mail/hdc/render";
import { t } from "@/lib/mail/hdc/strings";
import { renderAndDeliver } from "@/lib/mail/hdc/deliver";
import { loadOrder, orderLocale, paymentLabel } from "@/lib/mail/hdc/order-view";
import type { MailOptions } from "@/lib/mail/order-email";

/**
 * «Your payment did not go through.»
 *
 * No promise of a reservation: the shop keeps no stock after a declined card
 * (`reservedUntil` is only written for bank transfer), and a deadline nothing
 * enforces makes the customer wait thinking they have time.
 *
 * What is true stays: nothing was charged; Viva's payment link (a successful
 * retry turns the order CONFIRMED through the same webhook); the bank account,
 * with the order number as the reference; the phone.
 *
 * Which card was tried is unknown — Viva sends no masked number on a failed
 * transaction — and none is invented.
 */

const BANK = {
  holder: process.env.BANK_TRANSFER_HOLDER ?? "",
  iban: process.env.BANK_TRANSFER_IBAN ?? "",
  bank: process.env.BANK_TRANSFER_BANK ?? "",
};

export async function buildPaymentFailedEmail(
  orderNumber: string,
  detail: { statusId?: string | null },
  options: MailOptions = {},
) {
  const order = await loadOrder(orderNumber);
  if (!order) return null;
  const locale = options.locale ?? orderLocale(order);
  const amount = formatMoney(Number(order.totalGross), locale);

  const email = renderEmail({
    template: "payment-failed",
    locale,
    kind: "order",
    subject: t(locale, "failed.subject", { number: order.orderNumber }),
    preheader: t(locale, "failed.pre"),
    topline: { left: t(locale, "failed.topline"), right: order.orderNumber },
    assetOrigin: options.assetOrigin,
    data: {
      order: { number: order.orderNumber },
      payment: {
        retry_url: order.vivaOrderCode ? paymentPageUrl(order.vivaOrderCode) : "",
        rows: [
          { label: t(locale, "order.number"), value: order.orderNumber, strong: true },
          { label: t(locale, "paid.amount"), value: amount, strong: true },
          { label: t(locale, "paid.method"), value: paymentLabel(locale, order.paymentMethod) },
          { label: t(locale, "failed.reason"), value: t(locale, "failed.reason_text") },
          ...(detail.statusId ? [{ label: t(locale, "failed.code"), value: `Viva ${detail.statusId}` }] : []),
        ],
      },
      bank: BANK.iban.trim()
        ? {
            text: t(locale, "failed.bank_text", { amount, number: order.orderNumber }),
            rows: [
              ...(BANK.bank ? [{ label: t(locale, "bank.bank"), value: BANK.bank }] : []),
              ...(BANK.holder ? [{ label: t(locale, "bank.holder"), value: BANK.holder }] : []),
              { label: t(locale, "bank.iban"), value: BANK.iban, strong: true },
              { label: t(locale, "bank.reference"), value: order.orderNumber, strong: true },
            ],
          }
        : null,
    },
  });
  return { to: order.email, email };
}

export async function sendPaymentFailedEmail(orderNumber: string, detail: { statusId?: string | null }) {
  return renderAndDeliver(
    () => buildPaymentFailedEmail(orderNumber, detail),
    `payment-failed ${orderNumber}`,
    "Η παραγγελία δεν βρέθηκε.",
  );
}
