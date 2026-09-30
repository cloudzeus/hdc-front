/**
 * Wording that claims to represent a manufacturer. Never in public copy: the
 * HDC sells Milwaukee and is run by ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ; it does not present
 * itself as the manufacturer's dealer, agent or distributor (spec Δ5,
 * src/config/shop.ts). Client-safe: the admin editor checks with it live.
 *
 * Accent- and case-insensitive: every Greek vowel matches with or without its
 * tonos (and dialytika), σ matches ς, and the `iu` flags fold capitals — so
 * «ΑΝΤΙΠΡΟΣΩΠΟΣ», «αντιπροσωπος» and «Αντιπρόσωπος» are all caught.
 * «διανομέας» is, «διανομή» alone is not: the guides use it for electrical
 * distribution («Η CAT III αφορά διανομή μέσα στο κτίριο»).
 */

const VOWELS: Record<string, string> = {
  α: "[αά]",
  ε: "[εέ]",
  η: "[ηή]",
  ι: "[ιίϊΐ]",
  ο: "[οό]",
  υ: "[υύϋΰ]",
  ω: "[ωώ]",
  σ: "[σς]",
};

/** A Greek stem written without accents → a pattern that matches it with any accents. */
export function accentFree(stem: string): string {
  return stem.replace(/[αεηιουωσ]/g, (c) => VOWELS[c]).replace(/ /g, "\\s+");
}

/** Greek stems, written without accents (see `accentFree`). */
export const DEALER_STEMS = [
  "αντιπροσωπ",
  "εξουσιοδοτ",
  "διανομε",
  "επισημη διανομ",
  "επισημοσ συνεργατ",
  "επισημοσ μεταπωλητ",
] as const;

export const DEALER_WORDING = new RegExp(
  [
    ...DEALER_STEMS.map(accentFree),
    "certified\\s+partner",
    "authori[sz]ed",
    "dealer",
    "distribut",
    "official\\s+(?:reseller|partner)",
    "rivenditore\\s+autorizzato",
    "concessionari",
  ].join("|"),
  "iu",
);
