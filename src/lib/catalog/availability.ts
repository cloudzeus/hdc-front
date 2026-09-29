/**
 * What the shop promises about when a product leaves — one rule for the card,
 * the product page, the listing filter, search, cart and checkout.
 *
 *   stock     our own stock                          «Σε απόθεμα», no number; «Τελευταίο τεμάχιο» at one
 *   supplier  none of ours, the supplier XML has it  «Διαθέσιμο · 3–5 εργάσιμες»
 *   order     neither                                «Παράδοση 1–3 εργάσιμες», as before (still orderable)
 *
 * Spec: docs/superpowers/specs/2026-09-29-milwaukee-xml-supplier-design.md §5.2.
 */
export type Availability = "stock" | "supplier" | "order";

export function availabilityOf(p: { inStock: boolean; supplierAvailable?: boolean | null }): Availability {
  if (p.inStock) return "stock";
  if (p.supplierAvailable) return "supplier";
  return "order";
}

/** The only stock number the shop shows: the last piece. */
export function isLastPiece(qty: number | null | undefined): boolean {
  return Number(qty ?? 0) === 1;
}

/**
 * The order as a whole. One line from the supplier sends the whole order from
 * the supplier (spec decision A5), so it is «3–5 εργάσιμες» for all of it.
 */
export function orderAvailability(lines: Availability[]): Availability {
  if (lines.includes("supplier")) return "supplier";
  if (lines.every((l) => l === "stock")) return "stock";
  return "order";
}

/**
 * The message keys of a product's availability line — the same key names in
 * every namespace that shows one. `scripts/i18n/verify.ts` checks that each
 * namespace calling `t(availabilityLabelKey(…))` has all of them.
 */
export const AVAILABILITY_LABEL_KEYS = ["se_apothema", "teleftaio", "diathesimo_3_5", "paradosi_1_3"] as const;
export type AvailabilityLabelKey = (typeof AVAILABILITY_LABEL_KEYS)[number];

/**
 * Which words a product's availability line says. `qty` is our own stock, read
 * only for the last piece: the shop never shows any other number.
 */
export function availabilityLabelKey(
  availability: Availability,
  qty: number | null | undefined,
): AvailabilityLabelKey {
  if (availability === "stock") return isLastPiece(qty) ? "teleftaio" : "se_apothema";
  if (availability === "supplier") return "diathesimo_3_5";
  return "paradosi_1_3";
}

/** A line that asks for more than our warehouse holds (and it holds some). */
export function isOverStock(p: { inStock: boolean; qty: number; quantity: number }): boolean {
  return p.inStock && p.qty > 0 && p.quantity > p.qty;
}

/**
 * One cart line. Like the product, except that a line asking for more than our
 * stock, of a product the supplier has, sends the rest from the supplier — so
 * the line, and with it the whole order, is «3–5 εργάσιμες».
 */
export function lineAvailability(p: {
  inStock: boolean;
  supplierAvailable?: boolean | null;
  qty: number;
  quantity: number;
}): Availability {
  if (isOverStock(p) && p.supplierAvailable) return "supplier";
  return availabilityOf(p);
}

/** The same lines in Greek, for surfaces without next-intl (the newsletter). */
export const AVAILABILITY_LABELS_EL: Record<AvailabilityLabelKey, string> = {
  se_apothema: "Σε απόθεμα",
  teleftaio: "Τελευταίο τεμάχιο",
  diathesimo_3_5: "Διαθέσιμο · 3–5 εργάσιμες",
  paradosi_1_3: "Παράδοση 1–3 εργάσιμες",
};

/**
 * schema.org `Offer.availability`. The supplier's stock is buyable, so it is
 * InStock like ours; neither stays OutOfStock, as it always was.
 */
export function schemaOrgAvailability(availability: Availability): string {
  return availability === "order" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock";
}

/** Google Merchant `g:availability`, on the same rule as `schemaOrgAvailability`. */
export function merchantAvailability(availability: Availability): "in_stock" | "out_of_stock" {
  return availability === "order" ? "out_of_stock" : "in_stock";
}
