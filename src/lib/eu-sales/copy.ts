/**
 * The server's sentences for EU sales (spec 2026-10-23 §3, global
 * constraints «Copy»). The Greek is the spec's, verbatim; the form carries
 * the same sentences in messages/*.json. Greek for Greek, English for
 * everyone else — the rule of `internationalCopy`.
 *
 * Pure and client-safe.
 */
export type EuSalesCopy = {
  /** DHL could not price the destination: no order. */
  noDhl: string;
  /** Reverse-charge note under an exempt total. */
  exemptNote: string;
  invalid: string;
  unavailable: string;
  vatFormat: string;
  vatRequired: string;
  companyRequired: string;
  customerType: string;
};

export const EU_SALES_COPY: Record<"el" | "en", EuSalesCopy> = {
  el: {
    noDhl: "Η αποστολή στη χώρα σας δεν είναι διαθέσιμη αυτή τη στιγμή — επικοινωνήστε μαζί μας",
    exemptNote:
      "Ενδοκοινοτική παράδοση — απαλλαγή ΦΠΑ (αντίστροφη επιβάρυνση, άρθρο 138 Οδηγίας 2006/112/ΕΚ)",
    invalid: "Ο ΑΦΜ δεν είναι ενεργός στο VIES — η παραγγελία θα χρεωθεί με ΦΠΑ",
    unavailable: "Δεν ήταν δυνατός ο έλεγχος του ΑΦΜ τώρα — δοκιμάστε ξανά σε λίγο ή συνεχίστε με ΦΠΑ",
    vatFormat: "Ο ΑΦΜ δεν έχει τη μορφή της χώρας που επιλέξατε (π.χ. {example}).",
    vatRequired: "Για εταιρεία χρειάζονται επωνυμία και ΑΦΜ.",
    companyRequired: "Απαιτείται",
    customerType: "Επιλέξτε «Ιδιώτης» ή «Εταιρεία».",
  },
  en: {
    noDhl: "Shipping to your country is not available right now — please contact us",
    exemptNote:
      "Intra-community supply — VAT exempt (reverse charge, Article 138 of Directive 2006/112/EC)",
    invalid: "This VAT number is not active in VIES — the order will be charged with VAT",
    unavailable: "The VAT number could not be checked now — try again shortly or continue with VAT",
    vatFormat: "This VAT number does not match the country you chose (e.g. {example}).",
    vatRequired: "A company needs its name and VAT number.",
    companyRequired: "Required",
    customerType: "Choose «Individual» or «Company».",
  },
};

export function euSalesCopy(locale: string | null | undefined): EuSalesCopy {
  return locale === "el" || !locale ? EU_SALES_COPY.el : EU_SALES_COPY.en;
}

/** «DE123456789» — the example under the VAT field, by prefix. */
export function vatExample(prefix: string): string {
  return `${prefix}123456789`;
}
