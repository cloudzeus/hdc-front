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
