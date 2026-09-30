import "server-only";
import { formatMoney } from "@/lib/format";
import { renderEmail } from "@/lib/mail/hdc/render";
import { t } from "@/lib/mail/hdc/strings";
import { renderAndDeliver } from "@/lib/mail/hdc/deliver";
import {
  adminOrderUrl,
  buildOrderView,
  loadOrder,
  orderLocale,
  paymentLabel,
  shippingLabel,
} from "@/lib/mail/hdc/order-view";

/**
 * The shop's own emails about an order: a new order, and a status change.
 * Greek only, the simple layout, and what somebody needs to EXECUTE: the
 * buyer's email and phone, whether the money is in, the admin link.
 *
 * The figures come from the same `buildOrderView` as the customer's email, so
 * the shop never works from numbers the customer did not see.
 *
 * ── Why the two addresses are in the code ──────────────────────────────────
 *
 * `accounts@` and `info@`, always. An environment variable can be left empty
 * on one server — as `MAIL_BCC` was, and no order reached the shop for days.
 * `MAIL_ORDER_NOTIFY` can change them; it cannot erase them by accident.
 */

export function internalOrderRecipients(): string {
  return process.env.MAIL_ORDER_NOTIFY?.trim() || "accounts@kolleris.com, info@kolleris.com";
}

/** The status copy goes to the shop: the env changes it, never empties it. */
export function statusNoticeRecipients(): string {
  return process.env.MAIL_STATUS_NOTIFY?.trim() || "info@kolleris.com";
}

export type InternalOrderMailOutcome = { ok: true; id: string } | { ok: false; error: string };

export async function buildInternalOrderEmail(orderNumber: string, options: { assetOrigin?: string } = {}) {
  const order = await loadOrder(orderNumber);
  if (!order) return null;
  const view = await buildOrderView(order, "el");
  const total = formatMoney(Number(order.totalGross), "el");
  const paid = view.paid;
  const name = `${order.firstName} ${order.lastName}`.trim() || order.companyName || "—";

  const rows = [
    { label: t("el", "internal.customer"), value: name, strong: true },
    { label: t("el", "internal.email"), value: order.email },
    { label: t("el", "internal.phone"), value: order.phone },
    {
      label: t("el", "internal.address"),
      value: `${order.shipLine1}${order.shipLine2 ? `, ${order.shipLine2}` : ""}, ${order.shipPostcode} ${order.shipCity}`,
    },
    {
      label: t("el", "internal.payment"),
      value: `${paymentLabel("el", order.paymentMethod)} · ${t("el", paid ? "internal.paid" : "internal.unpaid")}`,
      strong: !paid,
    },
    { label: t("el", "internal.shipping"), value: shippingLabel("el", order.shippingMethod) },
    { label: t("el", "internal.document"), value: t("el", order.wantsInvoice ? "doc.invoice" : "doc.receipt") },
    ...(order.wantsInvoice
      ? [
          { label: t("el", "internal.company"), value: order.companyName || "—" },
          { label: t("el", "internal.vat"), value: `${order.vatNumber || "—"} · ${order.taxOffice || "—"}` },
        ]
      : []),
  ];

  const email = renderEmail({
    template: "internal-order",
    locale: "el",
    kind: "internal",
    subject: t("el", paid ? "internal.new_subject" : "internal.new_subject_unpaid", {
      number: order.orderNumber,
      total,
    }),
    preheader: `${order.lines.length} είδη · ${total} · ${t("el", paid ? "internal.paid" : "internal.unpaid")}`,
    topline: { left: t("el", "internal.topline"), right: order.orderNumber },
    assetOrigin: options.assetOrigin,
    data: {
      order: view,
      internal: {
        state_line: `${view.date} · ${t("el", paid ? "internal.paid" : "internal.unpaid")} · ${t("el", "internal.total")} ${total}`,
        rows,
        notes: order.notes?.trim() ?? "",
        admin_url: adminOrderUrl(order.orderNumber),
      },
    },
  });

  // Reply goes to the customer: the first move on an order that needs a word is to answer them.
  return { to: internalOrderRecipients(), email, replyTo: order.email };
}

export async function sendInternalOrderEmail(orderNumber: string): Promise<InternalOrderMailOutcome> {
  return renderAndDeliver(
    () => buildInternalOrderEmail(orderNumber),
    `internal-order ${orderNumber}`,
    "Η παραγγελία δεν βρέθηκε.",
  );
}

export async function buildInternalStatusEmail(
  orderNumber: string,
  statusName: string,
  options: { assetOrigin?: string } = {},
) {
  const order = await loadOrder(orderNumber);
  if (!order) return null;
  const locale = orderLocale(order);
  const name = `${order.firstName} ${order.lastName}`.trim() || order.companyName || "—";

  const email = renderEmail({
    template: "internal-order-status",
    locale: "el",
    kind: "internal",
    subject: t("el", "internal.status_subject", { number: order.orderNumber, status: statusName }),
    preheader: `${order.orderNumber} · ${statusName}`,
    topline: { left: t("el", "internal.topline"), right: order.orderNumber },
    assetOrigin: options.assetOrigin,
    data: {
      order: { number: order.orderNumber },
      internal: {
        lead: t("el", "internal.status_lead", { language: t("el", `lang.${locale}`) }),
        rows: [
          { label: t("el", "internal.status_now"), value: statusName, strong: true },
          { label: t("el", "internal.customer"), value: name },
          { label: t("el", "internal.email"), value: order.email },
          { label: t("el", "internal.phone"), value: order.phone },
          { label: t("el", "internal.total"), value: formatMoney(Number(order.totalGross), "el") },
        ],
        admin_url: adminOrderUrl(order.orderNumber),
      },
    },
  });
  return { to: statusNoticeRecipients(), email, replyTo: order.email };
}
