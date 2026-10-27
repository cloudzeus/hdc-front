import { DHL_SHIPPING_METHOD, SHIPPING_METHODS, type AnyShippingMethod } from "@/lib/cart/options";
import { COUNTRY_NAMES, EU_SHIPPING_COUNTRIES, HOME_COUNTRY, countryName } from "@/lib/shipping/countries";

/**
 * The countries EU sales deliver to — ONE list for the shop (spec §3.1).
 *
 * Greece, and the EU-27 minus Greece and Cyprus with DHL Express. Cyprus is
 * out of scope for now (no DHL price; ACS stays Greek-only under EU sales).
 * Built on `lib/shipping/countries` so the Greek/English/Italian names, the
 * postcode rules and the DHL contract stay where they already are.
 *
 * Pure and client-safe.
 */
export const DHL_DESTINATIONS: readonly string[] = EU_SHIPPING_COUNTRIES.filter(
  (c) => c !== HOME_COUNTRY && c !== "CY",
);

/** What the checkout's «Χώρα» offers with EU_SALES_ENABLED: Greece first. */
export const EU_SALES_COUNTRIES: readonly string[] = [HOME_COUNTRY, ...DHL_DESTINATIONS];

/** An EU country other than Greece and Cyprus: DHL Express, VIES possible. */
export function isDhlDestination(country: string | null | undefined): boolean {
  return DHL_DESTINATIONS.includes((country ?? "").trim().toUpperCase());
}

/** The posted country, or null when EU sales do not deliver there. Absent is Greece. */
export function normalizeEuSalesCountry(raw: string | null | undefined): string | null {
  const code = (raw ?? "").trim().toUpperCase() || HOME_COUNTRY;
  return EU_SALES_COUNTRIES.includes(code) ? code : null;
}

/** For the select: Ελλάδα first, then the rest by name in `locale`. */
export function euSalesCountryOptions(locale: string): Array<{ code: string; name: string }> {
  const collator = locale === "en" ? "en" : locale === "it" ? "it" : "el";
  return [
    { code: HOME_COUNTRY, name: countryName(HOME_COUNTRY, locale) },
    ...DHL_DESTINATIONS.filter((code) => COUNTRY_NAMES[code])
      .map((code) => ({ code, name: countryName(code, locale) }))
      .sort((a, b) => a.name.localeCompare(b.name, collator)),
  ];
}

/**
 * The VAT prefix VIES uses for a country: the ISO code, except Greece (EL).
 * Only foreign numbers go to VIES here; Greece stays on the AADE path.
 */
export function vatPrefixFor(country: string): string {
  const c = country.trim().toUpperCase();
  return c === "GR" ? "EL" : c;
}

/**
 * The delivery methods EU sales offer for a country. Greece: the three it
 * always had. Abroad: DHL Express only — no collection from the shop (spec
 * §3.1). Anything else: none.
 */
export function euSalesShippingMethods(country: string | null | undefined): readonly AnyShippingMethod[] {
  const c = (country ?? HOME_COUNTRY).trim().toUpperCase();
  if (c === HOME_COUNTRY) return SHIPPING_METHODS;
  return isDhlDestination(c) ? [DHL_SHIPPING_METHOD] : [];
}
