/**
 * Οι τύποι τιμής Milwaukee για την προεπισκόπηση στον browser.
 *
 * ΑΝΤΙΓΡΑΦΗ από το HDCtool, ΠΡΕΠΕΙ ΝΑ ΜΕΝΕΙ ΣΕ ΣΥΜΦΩΝΙΑ:
 * - `src/lib/milwaukee-1364-pricing.ts` (`calculateMilwaukee1364PriceR02`)
 * - `src/lib/milwaukee-xml-markup.ts` (`priceWFor`, `round2`)
 * - `src/lib/milwaukee-xml-admin-shared.ts` (`eshopPriceWithVat`, `marginPct`, `ratioLabel`)
 * Το `milwaukee-admin-pricing.test.ts` κρατά τιμές που βγήκαν από τον κώδικα
 * του HDCtool· αν αλλάξει ο κανόνας εκεί, το τεστ πρέπει να ξαναγραφτεί.
 *
 * Μόνο προεπισκόπηση: την τιμή που γράφεται την υπολογίζει πάντα το HDCtool.
 */

export const MILWAUKEE_1364_VAT_MULTIPLIER = 1.24;
export const UTBL02_1001_DISCOUNT = 0.88;
export const UTBL02_1002_DISCOUNT = 0.95;

export type XmlPricingModeInput = "SUGGESTED" | "MARKUP" | "MANUAL";

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * PRICER02 από PRICEW και UTBL02:
 * 1001 → PRICEW × 0,88 × 1,24 · 1002 → PRICEW × 0,95 × 1,24.
 * `null` αν PRICEW ≤ 0 ή UTBL02 όχι 1001/1002.
 */
export function calculateMilwaukee1364PriceR02(priceW: number, utbl02Code: number | null | undefined): number | null {
  if (priceW <= 0 || (utbl02Code !== 1001 && utbl02Code !== 1002)) return null;
  const discount = utbl02Code === 1001 ? UTBL02_1001_DISCOUNT : UTBL02_1002_DISCOUNT;
  return Math.round(priceW * discount * MILWAUKEE_1364_VAT_MULTIPLIER * 100) / 100;
}

/** PRICEW για τον τρόπο τιμής: πρόταση (κόστος × λόγος), ποσοστό ή χειροκίνητη. */
export function priceWFor(input: {
  mode: XmlPricingModeInput;
  costNet: number;
  suggestedRatio: number | null;
  markupPct: number | null;
  manualPriceW: number | null;
}): number | null {
  let value: number | null = null;
  if (input.mode === "SUGGESTED" && input.suggestedRatio != null) value = input.costNet * input.suggestedRatio;
  else if (input.mode === "MARKUP" && input.markupPct != null) value = input.costNet * (1 + input.markupPct / 100);
  else if (input.mode === "MANUAL") value = input.manualPriceW;
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return round2(value);
}

/** Τιμή eshop ΜΕ ΦΠΑ από PRICEW και UTBL02. */
export function eshopPriceWithVat(priceW: number | null | undefined, utbl02: number | null | undefined): number | null {
  if (priceW == null || !(priceW > 0)) return null;
  return calculateMilwaukee1364PriceR02(priceW, utbl02);
}

/** Περιθώριο επί της PRICEW: (PRICEW − κόστος) / PRICEW × 100, με ένα δεκαδικό. */
export function marginPct(priceW: number | null | undefined, costNet: number): number | null {
  if (priceW == null || !(priceW > 0)) return null;
  return Math.round(((priceW - costNet) / priceW) * 1000) / 10;
}

/** «×1,667 · 1001»: ο λόγος PRICEW/κόστος και η κλάση έκπτωσης. */
export function ratioLabel(priceW: number | null | undefined, costNet: number, utbl02: number): string | null {
  if (priceW == null || !(priceW > 0) || !(costNet > 0)) return null;
  const ratio = (priceW / costNet).toLocaleString("el-GR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return `×${ratio} · ${utbl02}`;
}
