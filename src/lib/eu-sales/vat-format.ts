import { vatPrefixFor } from "@/lib/eu-sales/countries";

/**
 * A foreign EU VAT number as the customer typed it → `DE123456789`, or a
 * wrong format. The browser's check before any VIES call (spec §3.2); HDCtool
 * normalises again and is the authority.
 *
 *   «de 123 456 789», «DE-123.456.789», «DEDE123456789», «123456789» → DE123456789
 *   a prefix that is not the selected country's («AT…» with Γερμανία)  → wrong format
 *
 * Pure and client-safe.
 */
export type EuVatFormat = { ok: true; vat: string } | { ok: false };

const FRENCH_BODY = /^[0-9A-HJ-NP-Z]{2}\d{9}$/;
/** The VIES prefixes (EL for Greece, XI for Northern Ireland). */
const EU_VAT_PREFIXES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI",
]);

export function normaliseEuVat(raw: string | null | undefined, country: string): EuVatFormat {
  const prefix = vatPrefixFor(country);
  let s = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  // A duplicated prefix («DEDE…») is a typo, not a different country.
  while (s.startsWith(prefix + prefix)) s = s.slice(prefix.length);
  if (s.startsWith(prefix)) s = s.slice(prefix.length);
  // France without its prefix: a two-character key (letters allowed, never
  // I or O) and the 9-digit SIREN — «AB123456789» is French, not «AB».
  // (Unless those two letters are another EU country's VAT prefix: Review Focus 1.)
  else if (prefix === "FR" && FRENCH_BODY.test(s) && !EU_VAT_PREFIXES.has(s.slice(0, 2))) {
    /* the body as typed */
  }
  // Another two-letter country code in front: not this country's number.
  else if (/^[A-Z]{2}/.test(s)) return { ok: false };
  if (s.length < 2 || s.length > 12 || !/\d/.test(s)) return { ok: false };
  return { ok: true, vat: `${prefix}${s}` };
}
