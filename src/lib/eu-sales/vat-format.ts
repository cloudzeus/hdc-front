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

export function normaliseEuVat(raw: string | null | undefined, country: string): EuVatFormat {
  const prefix = vatPrefixFor(country);
  let s = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  // A duplicated prefix («DEDE…») is a typo, not a different country.
  while (s.startsWith(prefix + prefix)) s = s.slice(prefix.length);
  if (s.startsWith(prefix)) s = s.slice(prefix.length);
  // Another two-letter country code in front: not this country's number.
  else if (/^[A-Z]{2}/.test(s)) return { ok: false };
  if (s.length < 2 || s.length > 12 || !/\d/.test(s)) return { ok: false };
  return { ok: true, vat: `${prefix}${s}` };
}
