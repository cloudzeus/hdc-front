import "server-only";
import { prisma } from "@/lib/prisma";
import { routing, type Locale } from "@/i18n/routing";
import { formatMoney, grossAmount } from "@/lib/format";
import { siteOrigin } from "@/lib/seo/urls";
import { SHOP } from "@/config/shop";
import { availabilityLabelKey, lineAvailability } from "@/lib/catalog/availability";
import { displayName } from "@/lib/milwaukee/display";
import { t } from "@/lib/mail/hdc/strings";
import { localeUrl } from "@/lib/mail/hdc/render";

/**
 * An order, as every HDC order email shows it.
 *
 * One builder for the confirmation, the payment, shipping, status and internal
 * emails, so the figures in them cannot disagree: two emails that say different
 * totals for the same order are worse than one that says nothing.
 *
 * ── Gross, like the storefront ─────────────────────────────────────────────
 *
 * The HDC sells to individuals and shows VAT-inclusive prices everywhere
 * (lib/format.ts). The figures are the ones the cart computed and the order
 * froze (lib/cart/cart.ts `computeTotals`): each line `grossAmount(net × qty,
 * its VAT rate)`, shipping and fees at 24%, and
 *
 *     subtotal − discount + shipping = total      (VAT included, stated once)
 *
 * The total is the stored `totalGross` exactly and the VAT line the stored
 * `vatAmount`. A line under an offer shows its price BEFORE the discount, and
 * the discount is taken off once in the totals; any cent of rounding between
 * the per-line figures and the stored totals is absorbed there, so what the
 * reader adds up is what was charged.
 */

function findOrder(orderNumber: string) {
  return prisma.order.findUnique({ where: { orderNumber }, include: { lines: true } });
}

export type OrderWithLines = NonNullable<Awaited<ReturnType<typeof findOrder>>>;

/** An order number (read afresh) or an order already in hand (the admin preview's sample). */
export type OrderRef = string | OrderWithLines;

export async function loadOrder(ref: OrderRef): Promise<OrderWithLines | null> {
  return typeof ref === "string" ? findOrder(ref) : ref;
}

/**
 * The customer's language, frozen on the order at checkout.
 *
 * Kept inside `shippingQuote` (the order's frozen checkout snapshot) because a
 * column would need a migration on the live database; `Order.locale` is the
 * clean home for it once one is approved. Older orders have none: Greek.
 */
export function orderLocale(order: { shippingQuote: unknown }): Locale {
  const value = (order.shippingQuote as { locale?: unknown } | null)?.locale;
  return routing.locales.includes(value as Locale) ? (value as Locale) : "el";
}

/** «30.09.2026, 11:42», Athens time, 24-hour — the same in every language. */
export function stamp(date: Date, withTime = true): string {
  const parts = new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
    timeZone: "Europe/Athens",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = `${get("day")}.${get("month")}.${get("year")}`;
  return withTime ? `${day}, ${get("hour")}:${get("minute")}` : day;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function shippingLabel(locale: Locale, id: string): string {
  return id === "courier" || id === "express" || id === "pickup" ? t(locale, `method.${id}`) : id;
}

export function paymentLabel(locale: Locale, id: string): string {
  return id === "card" || id === "iris" || id === "bank" ? t(locale, `pay.${id}`) : id;
}

/** The public page of the order: works for guests too, through the token. */
export function orderUrl(locale: Locale, order: { orderNumber: string; guestToken: string }): string {
  return localeUrl(
    locale,
    `/checkout/epibebaiosi/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(order.guestToken)}`,
  );
}

export function adminOrderUrl(orderNumber: string): string {
  return `${siteOrigin()}/admin/orders/${encodeURIComponent(orderNumber)}`;
}

function etaLine(locale: Locale, order: OrderWithLines): string {
  if (order.shippingMethod === "pickup") return t(locale, "eta.pickup");
  if (order.supplierOrder) return t(locale, "eta.supplier");
  const days = Number((order.shippingQuote as { etaDays?: unknown } | null)?.etaDays);
  if (!Number.isFinite(days) || days <= 0) return "";
  return days === 1 ? t(locale, "eta.day") : t(locale, "eta.days", { n: days });
}

export type OrderItemView = {
  name: string;
  code: string;
  qty: string;
  unit: string;
  total: string;
  image: string;
  url: string;
  availability: { label: string; tone: "ok" | "wait" } | null;
};

/**
 * What each line promises now: the product's stock, as the cart decided it.
 * Read from the catalogue because the line does not store it; for an email
 * sent at checkout it is the same answer the customer saw.
 */
async function lineFacts(order: OrderWithLines) {
  const ids = order.lines.map((l) => l.productId).filter((id): id is string => !!id);
  const products = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, slug: true, inStock: true, supplierAvailable: true, qty: true },
      })
    : [];
  return new Map(products.map((p) => [p.id, p]));
}

export async function buildOrderView(
  order: OrderWithLines,
  locale: Locale,
  options: {
    prices?: boolean;
    /**
     * The per-line availability badge. Only the order confirmation shows it —
     * it is today's stock, which by the time an order ships or changes
     * status says nothing true about THIS order.
     */
    availability?: boolean;
  } = {},
) {
  const money = (n: unknown) => formatMoney(Number(n), locale);
  const facts = await lineFacts(order);
  const paid = order.paymentStatus === "PAID";

  const priced = order.lines.map((line) => {
    const d = Number(line.discountPercent) || 0;
    const vatRate = Number(line.vatRate);
    // The stored gross when there is no offer — exactly what the cart charged.
    const lineBefore =
      d > 0
        ? grossAmount(round2(Number(line.unitNet) / (1 - d / 100)) * line.quantity, { vatRate })
        : round2(Number(line.lineGross));
    return { line, unitBefore: round2(lineBefore / line.quantity), lineBefore };
  });

  const items: OrderItemView[] = priced.map(({ line, unitBefore, lineBefore }) => {
    const product = line.productId ? facts.get(line.productId) : undefined;
    const availability = product && options.availability
      ? lineAvailability({
          inStock: product.inStock,
          supplierAvailable: product.supplierAvailable,
          qty: Number(product.qty ?? 0),
          quantity: line.quantity,
        })
      : null;
    const key = availability ? availabilityLabelKey(availability, Number(product?.qty ?? 0)) : null;
    return {
      name: displayName(line.name, line.sku),
      code: line.sku,
      qty: String(line.quantity),
      unit: options.prices === false ? "" : money(unitBefore),
      total: options.prices === false ? "" : money(lineBefore),
      image: line.imageUrl ?? "",
      url: product ? localeUrl(locale, `/proion/${product.slug}`) : "",
      availability: key
        ? { label: t(locale, `avail.${key}`), tone: availability === "stock" ? "ok" : "wait" }
        : null,
    };
  });

  const totals = grossTotals(order, priced.map((p) => ({ lineBefore: p.lineBefore, discounted: Number(p.line.discountPercent) > 0 })));
  const method = shippingLabel(locale, order.shippingMethod);
  const rates = [...new Set(order.lines.map((l) => Number(l.vatRate)))];

  const totalRows = [
    { label: t(locale, "order.subtotal"), value: money(totals.subtotal) },
    ...(totals.discount > 0 ? [{ label: t(locale, "order.discount"), value: `−${money(totals.discount)}` }] : []),
    {
      label: t(locale, "order.shipping", {
        method: totals.fee > 0 ? t(locale, "order.payment_fee", { method }) : method,
      }),
      value: totals.shipping > 0 ? money(totals.shipping) : t(locale, "order.free"),
    },
  ];
  // The rate only when there is one: a mixed basket has no single «24%».
  const vatLine =
    rates.length === 1
      ? t(locale, "order.vat_included", { rate: `${rates[0]}%`, amount: money(order.vatAmount) })
      : t(locale, "order.vat_included_plain", { amount: money(order.vatAmount) });

  const fullName = `${order.firstName} ${order.lastName}`.trim();
  const shipAddress = order.shipLine1 + (order.shipLine2 ? `, ${order.shipLine2}` : "");
  const shipCity = `${order.shipPostcode} ${order.shipCity}`;
  const eta = etaLine(locale, order);
  const pickup = order.shippingMethod === "pickup";

  const billing = order.wantsInvoice
    ? [
        order.companyName ?? fullName,
        order.billLine1 ?? shipAddress,
        `${order.billPostcode ?? order.shipPostcode} ${order.billCity ?? order.shipCity}`,
        ...(order.vatNumber
          ? [t(locale, "order.vat_number", { vat: order.vatNumber, doy: order.taxOffice || "—" })]
          : []),
      ]
    : [fullName, shipAddress, shipCity];

  const cols = [
    {
      title: t(locale, pickup ? "order.pickup_title" : "order.shipping_title"),
      strong: eta ? `${method} · ${eta}` : method,
      lines: pickup
        ? [SHOP.name, SHOP.contact.address]
        : [fullName, shipAddress, shipCity, order.phone].filter(Boolean),
    },
    {
      title: t(locale, "order.payment_title"),
      strong: paymentLabel(locale, order.paymentMethod),
      ok: paid ? t(locale, "state.paid") : undefined,
      wait: paid ? undefined : t(locale, "state.pending"),
      lines: [
        t(locale, "order.document", {
          type: t(locale, order.wantsInvoice ? "doc.invoice" : "doc.receipt"),
        }),
        ...billing.filter(Boolean),
      ],
    },
  ];

  return {
    number: order.orderNumber,
    date: stamp(order.createdAt),
    url: orderUrl(locale, order),
    paid,
    supplier: order.supplierOrder,
    state: paid
      ? { label: t(locale, "state.paid"), tone: "ok" }
      : { label: t(locale, "state.pending"), tone: "wait" },
    items,
    totals: totalRows,
    total: money(order.totalGross),
    vat_line: vatLine,
    cols,
  };
}

/**
 * The gross totals rows of an order, adding up to the stored `totalGross`.
 *
 * Shipping and fees are the stored gross figures; the subtotal is the lines
 * before any offer; the discount is whatever takes that subtotal to the
 * stored total minus shipping — so the rounding of individual lines can never
 * make the rows disagree with what was charged.
 */
export function grossTotals(
  order: { subtotalGross: unknown; shippingGross: unknown; paymentFeeGross: unknown; totalGross: unknown },
  lines: Array<{ lineBefore: number; discounted: boolean }>,
) {
  const total = round2(Number(order.totalGross));
  const fee = round2(Number(order.paymentFeeGross));
  const shipping = round2(Number(order.shippingGross) + fee);
  const goods = round2(total - shipping);
  const anyOffer = lines.some((l) => l.discounted);
  const before = round2(lines.reduce((sum, l) => sum + l.lineBefore, 0));
  const discount = anyOffer ? Math.max(0, round2(before - goods)) : 0;
  const subtotal = discount > 0 ? round2(goods + discount) : goods;
  return { subtotal, discount, shipping, fee, total };
}
