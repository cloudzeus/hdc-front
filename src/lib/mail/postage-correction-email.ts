import "server-only";
import { prisma } from "@/lib/prisma";
import { sendTemplateMail } from "@/lib/mail/send-template";
import { PAYMENT_METHODS } from "@/lib/cart/options";
import { siteOrigin } from "@/lib/seo/urls";
import { PRIMARY_PHONE, SHOP } from "@/config/shop";

const { weekdays, saturday } = SHOP.contact.hours;
/** "Δευ–Παρ 08:00–16:00, Σάβ 09:00–14:00", from the shop config. */
const HOURS_LINE = `Δευ–Παρ ${weekdays.open}–${weekdays.close}, Σάβ ${saturday.open}–${saturday.close}`;

/**
 * «Συγγνώμη για το λάθος» — the corrected price, and a way to pay it.
 *
 * Sent by an operator after the postage of an unpaid order was re-priced. It
 * owns the mistake in plain words, shows the old figures struck through next to
 * the new ones, and links to `/api/payment/pay/…`, which opens a Viva payment
 * for whatever the order holds at the moment of the click — so the button
 * still works when the email is read the next day.
 */

const money = (value: number) => `${value.toFixed(2).replace(".", ",")} €`;

function stamp(date: Date): string {
  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Athens",
  }).format(date);
}

export async function sendPostageCorrectionEmail(
  orderNumber: string,
  correction: { previousShippingGross: number; previousTotalGross: number; message?: string },
) {
  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order) return { ok: false as const, error: "Η παραγγελία δεν βρέθηκε." };

  const payUrl = `${siteOrigin()}/api/payment/pay/${order.orderNumber}?t=${order.guestToken}`;
  const method = PAYMENT_METHODS.find((m) => m.id === order.paymentMethod)?.label ?? order.paymentMethod;
  const message = correction.message?.trim().slice(0, 1500) || "";

  return sendTemplateMail({
    to: order.email,
    templateId: "order-price-correction",
    subject: `Διόρθωση τιμής — παραγγελία ${order.orderNumber}`,
    preheader: `Υπολογίσαμε λάθος τα μεταφορικά. Νέο σύνολο ${money(Number(order.totalGross))} — δεν έγινε καμία χρέωση.`,
    context: order.orderNumber,
    data: {
      recipient: { first_name: order.firstName, last_name: order.lastName, email: order.email },
      order: {
        number: order.orderNumber,
        date: stamp(order.createdAt),
        subtotal: money(Number(order.subtotalGross)),
      },
      correction: {
        previous_shipping: money(correction.previousShippingGross),
        shipping: money(Number(order.shippingGross)),
        previous_total: money(correction.previousTotalGross),
        total: money(Number(order.totalGross)),
        message,
      },
      payment: { method, pay_url: payUrl },
    },
    text: [
      `Διόρθωση τιμής — παραγγελία ${order.orderNumber}`,
      "",
      `${order.firstName}, υπολογίσαμε λάθος τα μεταφορικά της παραγγελίας σας: ${money(correction.previousShippingGross)} αντί για ${money(Number(order.shippingGross))}. Το λάθος ήταν δικό μας και σας ζητούμε συγγνώμη.`,
      "Δεν έγινε καμία χρέωση στην κάρτα σας.",
      ...(message ? ["", message] : []),
      "",
      `Προϊόντα: ${money(Number(order.subtotalGross))}`,
      `Μεταφορικά: ${money(Number(order.shippingGross))} (αντί ${money(correction.previousShippingGross)})`,
      `Νέο σύνολο: ${money(Number(order.totalGross))} (αντί ${money(correction.previousTotalGross)})`,
      "",
      `Ολοκλήρωση πληρωμής: ${payUrl}`,
      "",
      `Χρειάζεστε βοήθεια; ${PRIMARY_PHONE.display} (${HOURS_LINE}) ή απαντήστε σε αυτό το email.`,
    ].join("\n"),
  });
}
