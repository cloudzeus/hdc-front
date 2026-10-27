import type { VatMode } from "@/lib/cart/options";
import { isDhlDestination } from "@/lib/eu-sales/countries";

/**
 * Who pays VAT on an order (spec §3.3, global constraints «Zero VAT»).
 *
 * `intra_eu_exempt` ONLY when all of these hold:
 *   - the delivery country is an EU country other than Greece (and Cyprus,
 *     out of scope for now);
 *   - the customer chose «Εταιρεία»;
 *   - VIES said `valid`, for this same country when the result says which;
 *   - that answer is from the same calendar day in Europe/Athens.
 *
 * Anything else — individual, invalid, unavailable, a wrong format, a result
 * from yesterday, a result for the country selected before — is `standard`.
 * Pure: the caller fetches the VIES answer (the server re-checks in
 * `placeOrder`; a browser flag is never an input).
 */
export type CustomerType = "individual" | "company";

export type VatModeInput = {
  country: string;
  customerType: CustomerType;
  vies: {
    status: string;
    checkedAt: string | null;
    /** The country the number was checked for. A different one is stale. */
    country?: string | null;
  } | null;
};

/** «2026-10-27» — the calendar day in Athens. */
export function athensDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function resolveVatMode(input: VatModeInput, now: Date = new Date()): VatMode {
  const country = input.country.trim().toUpperCase();
  if (!isDhlDestination(country)) return "standard";
  if (input.customerType !== "company") return "standard";
  const vies = input.vies;
  if (!vies || vies.status !== "valid" || !vies.checkedAt) return "standard";
  if (vies.country != null && vies.country.trim().toUpperCase() !== country) return "standard";
  const checked = new Date(vies.checkedAt);
  if (Number.isNaN(checked.getTime())) return "standard";
  return athensDay(checked) === athensDay(now) ? "intra_eu_exempt" : "standard";
}
