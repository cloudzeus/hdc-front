import "server-only";
import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";
import { renderEmail } from "@/lib/mail/hdc/render";
import { t } from "@/lib/mail/hdc/strings";
import { renderAndDeliver } from "@/lib/mail/hdc/deliver";
import {
  adminOrderUrl,
  loadOrder,
  shippingLabel,
  stamp,
  type OrderRef,
  type OrderWithLines,
} from "@/lib/mail/hdc/order-view";
import { localeUrl } from "@/lib/mail/hdc/render";
import { internalOrderRecipients } from "@/lib/mail/order-internal-email";
import type { MailOptions } from "@/lib/mail/order-email";
import { displayName } from "@/lib/milwaukee/display";
import { routing } from "@/i18n/routing";
import {
  REQUEST_ANSWER_HOURS,
  compareOffer,
  offerShippingNet,
  priceLines,
  readSnapshot,
  readStoredOffer,
  requestPath,
  type ComparisonRow,
  type RequestLine,
  type StoredOffer,
} from "@/lib/requests/model";

/**
 * The back-order request emails (docs/backorder-requests.md §7), in the HDC
 * email system: the customer's language, the shared partials, the plain text
 * derived from the HTML.
 *
 *   received   «Λάβαμε το αίτημά σας — θα επιβεβαιωθεί εντός 24 ωρών»
 *   offer      the offer is ready, with the link
 *   reminder   the one reminder, 24 hours into an unanswered offer
 *   rejected   the shop cannot supply it, with the reason
 *   expired    the offer ran out
 *   internal   to the shop, when a request arrives (Greek only)
 *
 * ── The link is the credential ─────────────────────────────────────────────
 *
 * `/aitima/{token}` opens without a login. Every customer email here is sent
 * with Mailgun tracking OFF, so the link is not rewritten through Mailgun's
 * redirect host and the token never sits in somebody else's click log.
 */

export type RequestEmailKind = "received" | "offer" | "reminder" | "rejected" | "expired";
export type RequestMailOutcome = { ok: true; id: string } | { ok: false; error: string };

/** The request's language: frozen in the snapshot at submission. */
function requestLocale(order: OrderWithLines, fallback?: Locale): Locale {
  if (fallback) return fallback;
  const value = readSnapshot(order.requestLines)?.locale;
  return routing.locales.includes(value as Locale) ? (value as Locale) : "el";
}

function requestLink(order: OrderWithLines, locale: Locale): string {
  const token = order.requestToken ?? "PREVIEW";
  return localeUrl(locale, requestPath("el", token));
}

/**
 * The admin preview has no request to show: dress the order up as one —
 * its lines as the request, an offer that keeps one, changes one and replaces
 * one. Never saved; the real emails read the stored request.
 */
export function previewRequest(order: OrderWithLines, kind: RequestEmailKind | "internal"): OrderWithLines {
  if (order.requestStatus) return order;
  const lines: RequestLine[] = order.lines.map((line, i) => ({
    lineId: `L${i + 1}`,
    productId: line.productId,
    mtrl: line.mtrl ?? 100 + i,
    sku: line.sku,
    name: line.name,
    brand: line.brand,
    imageUrl: line.imageUrl,
    qty: line.quantity,
    unitNet: Number(line.unitNet),
    vatRate: Number(line.vatRate),
    stockAtRequest: 0,
  }));
  const receivedAt = new Date(order.createdAt);
  const expiresAt = new Date(receivedAt.getTime() + 3 * 86_400_000);
  const offer: StoredOffer =
    kind === "rejected"
      ? { decision: "reject", version: 1, receivedAt: receivedAt.toISOString(), reason: "Ο κωδικός έχει αποσυρθεί από τον κατασκευαστή." }
      : {
          decision: "offer",
          version: 1,
          receivedAt: receivedAt.toISOString(),
          lines: lines.slice(0, 3).map((line, i) => ({
            kind: i === 0 ? "original" : i === 1 ? "modified" : "alternative",
            replacesLineId: line.lineId,
            mtrl: i === 2 ? (line.mtrl ?? 0) + 1 : (line.mtrl ?? 0),
            sku: line.sku,
            name: i === 2 ? `${line.name} (νεότερη έκδοση)` : line.name,
            qty: i === 1 ? line.qty + 1 : line.qty,
            unitNet: i === 1 ? Math.round(line.unitNet * 95) / 100 : line.unitNet,
            vatRate: line.vatRate,
            leadTimeText: i === 2 ? "7–10 εργάσιμες" : null,
          })),
          removedLineIds: [],
          leadTimeText: "5–7 εργάσιμες",
          note: "Η μπαταρία έρχεται σε συσκευασία δύο τεμαχίων.",
          shippingNet: null,
          quotedShippingNet: 4.5,
          expiresAt: expiresAt.toISOString(),
        };
  return {
    ...order,
    requestStatus: kind === "rejected" ? "REJECTED" : kind === "expired" ? "EXPIRED" : kind === "received" || kind === "internal" ? "REQUESTED" : "OFFERED",
    requestToken: "PREVIEW",
    requestedAt: order.createdAt,
    requestLines: { v: 1, locale: "el", lines },
    offerVersion: kind === "received" || kind === "internal" ? null : 1,
    offerJson: kind === "received" || kind === "internal" ? null : offer,
    offerExpiresAt: kind === "offer" || kind === "reminder" ? expiresAt : null,
  } as OrderWithLines;
}

function itemRows(locale: Locale, rows: ComparisonRow[]) {
  const money = (n: number) => formatMoney(n, locale);
  return rows.map((row) => {
    if (row.kind === "removed") {
      const r = row.requested;
      const priced = priceLines([r], 0).lines[0];
      return {
        tag: t(locale, "req.tag.removed"),
        name: displayName(r.name, r.sku),
        code: r.sku,
        detail: t(locale, "req.qty", { qty: r.qty }),
        total: money(priced.lineGross),
        struck: true,
        was: "",
      };
    }
    const o = row.offered;
    const priced = priceLines([o], 0).lines[0];
    const base = {
      name: displayName(o.name, o.sku),
      code: o.sku,
      detail: t(locale, "req.qty_unit", { qty: o.qty, unit: money(priced.unitGross) }) + (o.leadTimeText ? ` · ${o.leadTimeText}` : ""),
      total: money(priced.lineGross),
      struck: false,
    };
    if (row.kind === "alternative") {
      return {
        ...base,
        tag: t(locale, "req.tag.alternative"),
        was: row.requested ? t(locale, "req.instead_of", { name: displayName(row.requested.name, row.requested.sku) }) : "",
      };
    }
    if (row.kind === "added") return { ...base, tag: t(locale, "req.tag.added"), was: "" };
    if (row.kind === "modified") {
      const r = row.requested;
      const parts = [
        row.qtyChanged ? t(locale, "req.was_qty", { qty: r.qty }) : "",
        row.priceChanged ? t(locale, "req.was_price", { price: money(priceLines([r], 0).lines[0].unitGross) }) : "",
      ].filter(Boolean);
      return { ...base, tag: t(locale, "req.tag.modified"), was: parts.length ? t(locale, "req.was", { text: parts.join(" · ") }) : "" };
    }
    return { ...base, tag: "", was: "" };
  });
}

export async function buildRequestEmail(
  ref: OrderRef,
  kind: RequestEmailKind,
  options: MailOptions & { preview?: boolean } = {},
) {
  const loaded = await loadOrder(ref);
  if (!loaded) return null;
  const order = options.preview ? previewRequest(loaded, kind) : loaded;
  if (!order.requestStatus) return null;

  const locale = requestLocale(order, options.locale);
  const money = (n: number) => formatMoney(n, locale);
  const link = requestLink(order, locale);
  const number = order.orderNumber;
  const requested = readSnapshot(order.requestLines)?.lines ?? [];
  const offer = readStoredOffer(order.offerJson);
  const date = (d: Date) => stamp(d);
  const parent = order.parentOrderNumber ? [t(locale, "req.parent", { number: order.parentOrderNumber })] : [];

  let subject: string;
  let preheader: string;
  let req: Record<string, unknown>;

  if (kind === "received") {
    const priced = priceLines(requested, 0);
    subject = t(locale, "req.received.subject", { number });
    preheader = t(locale, "req.received.pre", { hours: REQUEST_ANSWER_HOURS });
    req = {
      eyebrow: t(locale, "req.received.eyebrow"),
      title: t(locale, "req.received.title"),
      lead: t(locale, "req.received.lead", { hours: REQUEST_ANSWER_HOURS }),
      paragraphs: [t(locale, "req.received.no_charge"), ...parent],
      items_title: t(locale, "req.requested_title"),
      items_aside: t(locale, "order.prices_gross"),
      items: itemRows(
        locale,
        requested.map((r) => ({ kind: "same" as const, requested: r, offered: { ...r, kind: "original" as const, replacesLineId: r.lineId, mtrl: r.mtrl ?? 0, leadTimeText: null }, qtyChanged: false, priceChanged: false })),
      ),
      totals: [{ label: t(locale, "order.shipping", { method: shippingLabel(locale, order.shippingMethod) }), value: t(locale, "req.shipping_later") }],
      total: { label: t(locale, "req.indicative"), value: money(priced.subtotalGross), vat_line: "" },
      cta: { label: t(locale, "req.view"), href: link, note: t(locale, "req.private") },
    };
  } else if (kind === "rejected") {
    const reason = offer?.decision === "reject" ? offer.reason : null;
    subject = t(locale, "req.rejected.subject", { number });
    preheader = t(locale, "req.rejected.pre");
    req = {
      eyebrow: t(locale, "req.rejected.eyebrow"),
      title: t(locale, "req.rejected.title"),
      lead: t(locale, "req.rejected.lead", { number }),
      paragraphs: [t(locale, "req.rejected.more")],
      ...(reason ? { note: reason, note_title: t(locale, "req.rejected.reason"), note_tone: "red" } : {}),
      cta: { label: t(locale, "req.view"), href: link, note: t(locale, "req.private") },
    };
  } else if (kind === "expired") {
    subject = t(locale, "req.expired.subject", { number });
    preheader = t(locale, "req.expired.pre");
    req = {
      eyebrow: t(locale, "req.expired.eyebrow"),
      title: t(locale, "req.expired.title"),
      lead: t(locale, "req.expired.lead", { number }),
      paragraphs: [t(locale, "req.expired.contact")],
      cta: { label: t(locale, "req.view"), href: link, note: t(locale, "req.private") },
    };
  } else {
    if (offer?.decision !== "offer") return null;
    const expires = order.offerExpiresAt ?? new Date(offer.expiresAt);
    const shippingNet = offerShippingNet(offer);
    const totals = priceLines(offer.lines, shippingNet ?? 0);
    const reminder = kind === "reminder";
    subject = t(locale, reminder ? "req.reminder.subject" : "req.offer.subject", { number });
    preheader = t(locale, "req.offer.pre", { date: date(expires) });
    req = {
      eyebrow: t(locale, reminder ? "req.reminder.eyebrow" : "req.offer.eyebrow"),
      title: t(locale, reminder ? "req.reminder.title" : "req.offer.title"),
      lead: reminder
        ? t(locale, "req.reminder.lead", { number, date: date(expires) })
        : t(locale, "req.offer.lead", { number }),
      paragraphs: parent,
      ...(offer.note ? { note: offer.note, note_title: t(locale, "req.note_title"), note_tone: "wait" } : {}),
      facts: [
        ...(offer.leadTimeText ? [{ label: t(locale, "req.lead_time"), value: offer.leadTimeText, strong: true }] : []),
        { label: t(locale, "req.shipping"), value: shippingLabel(locale, order.shippingMethod) },
        { label: t(locale, "req.valid_until"), value: date(expires), strong: true },
      ],
      items_title: t(locale, "req.offer.items"),
      items_aside: t(locale, "order.prices_gross"),
      items: itemRows(locale, compareOffer(requested, offer.lines)),
      totals: [
        { label: t(locale, "order.subtotal"), value: money(totals.subtotalGross) },
        {
          label: t(locale, "order.shipping", { method: shippingLabel(locale, order.shippingMethod) }),
          value: shippingNet == null ? t(locale, "req.shipping_later") : totals.shippingGross === 0 ? t(locale, "order.free") : money(totals.shippingGross),
        },
      ],
      total: {
        label: t(locale, "order.total"),
        value: money(totals.totalGross),
        vat_line: t(locale, "order.vat_included_plain", { amount: money(totals.vatAmount) }),
      },
      cta: { label: t(locale, "req.offer.accept"), href: link, note: t(locale, "req.offer.valid_note", { date: date(expires) }) },
    };
  }

  const email = renderEmail({
    template: "order-request",
    locale,
    kind: "order",
    subject,
    preheader,
    topline: { left: t(locale, "req.topline"), right: number },
    assetOrigin: options.assetOrigin,
    data: { req },
  });
  return { to: order.email, email, tracking: false as const };
}

export async function sendRequestEmail(kind: RequestEmailKind, orderNumber: string): Promise<RequestMailOutcome> {
  return renderAndDeliver(
    () => buildRequestEmail(orderNumber, kind),
    `order-request:${kind} ${orderNumber}`,
    "Το αίτημα δεν βρέθηκε.",
  );
}

/** To the shop, Greek. The decision is HDCtool's: this is the heads-up and the contact details. */
export async function buildInternalRequestEmail(ref: OrderRef, options: { assetOrigin?: string; preview?: boolean } = {}) {
  const loaded = await loadOrder(ref);
  if (!loaded) return null;
  const order = options.preview ? previewRequest(loaded, "internal") : loaded;
  if (!order.requestStatus) return null;

  const requested = readSnapshot(order.requestLines)?.lines ?? [];
  const priced = priceLines(requested, 0);
  const total = formatMoney(priced.subtotalGross, "el");
  const name = `${order.firstName} ${order.lastName}`.trim() || order.companyName || "—";

  const items = requested.map((r) => ({
    tag: r.stockAtRequest != null && r.stockAtRequest > 0 ? t("el", "internal.req_stock", { n: r.stockAtRequest }) : t("el", "internal.req_nostock"),
    name: displayName(r.name, r.sku),
    code: r.sku,
    detail: `${t("el", "req.qty", { qty: r.qty })}${r.mtrl != null ? ` · MTRL ${r.mtrl}` : ""}`,
    total: formatMoney(priceLines([r], 0).lines[0].lineGross, "el"),
    struck: false,
    was: "",
  }));

  const email = renderEmail({
    template: "internal-request",
    locale: "el",
    kind: "internal",
    subject: t("el", "internal.req_subject", { number: order.orderNumber, total }),
    preheader: `${requested.length} είδη · ${total} · απάντηση εντός ${REQUEST_ANSWER_HOURS} ωρών`,
    topline: { left: t("el", "internal.topline"), right: order.orderNumber },
    assetOrigin: options.assetOrigin,
    data: {
      req: {
        number: order.orderNumber,
        lead: t("el", "internal.req_lead", { hours: REQUEST_ANSWER_HOURS }),
        rows: [
          { label: t("el", "internal.customer"), value: name, strong: true },
          { label: t("el", "internal.email"), value: order.email },
          { label: t("el", "internal.phone"), value: order.phone },
          {
            label: t("el", "internal.address"),
            value: `${order.shipLine1}${order.shipLine2 ? `, ${order.shipLine2}` : ""}, ${order.shipPostcode} ${order.shipCity}`,
          },
          { label: t("el", "internal.shipping"), value: shippingLabel("el", order.shippingMethod) },
          { label: t("el", "internal.document"), value: t("el", order.wantsInvoice ? "doc.invoice" : "doc.receipt") },
          ...(order.wantsInvoice
            ? [{ label: t("el", "internal.vat"), value: `${order.companyName || "—"} · ${order.vatNumber || "—"}` }]
            : []),
        ],
        parent: order.parentOrderNumber ? t("el", "internal.req_parent", { number: order.parentOrderNumber }) : "",
        notes: order.notes?.trim() ?? "",
        items,
        totals: [{ label: t("el", "order.shipping", { method: shippingLabel("el", order.shippingMethod) }), value: t("el", "req.shipping_later") }],
        total: { label: t("el", "req.indicative"), value: total },
        admin_url: adminOrderUrl(order.orderNumber),
      },
    },
  });
  // Reply goes to the customer, like the new-order email.
  return { to: internalOrderRecipients(), email, replyTo: order.email };
}

export async function sendInternalRequestEmail(orderNumber: string): Promise<RequestMailOutcome> {
  return renderAndDeliver(
    () => buildInternalRequestEmail(orderNumber),
    `internal-request ${orderNumber}`,
    "Το αίτημα δεν βρέθηκε.",
  );
}
