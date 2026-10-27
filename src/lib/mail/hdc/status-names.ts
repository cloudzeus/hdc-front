/**
 * The order status as a customer outside Greece reads it.
 *
 * HDCtool sends the SoftOne state's own name (`SALDOC.FINSTATES`), in Greek.
 * Greek emails print it as it is (the ERP's wording is the truth). Any other
 * language gets a known name translated and an unknown one replaced by a
 * generic line: a Greek word in an English subject is worse than a vague one.
 * Mirrors the Kolleris shop's `statusNameEn`.
 */

const norm = (s: string) =>
  s.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ");

const EN: Record<string, string> = {
  "σε επεξεργασια": "Processing",
  "σε προετοιμασια": "Being prepared",
  "σε αναμονη": "On hold",
  "ετοιμη για αποστολη": "Ready to ship",
  "εσταλη": "Shipped",
  "απεσταλη": "Shipped",
  "παραδωση σε courier": "Handed to courier",
  "παραδοση σε courier": "Handed to courier",
  "παραδωση σε πελατη": "Delivered to customer",
  "παραδοση σε πελατη": "Delivered to customer",
  "παραδοθηκε": "Delivered",
  "ολοκληρωθηκε": "Completed",
  "ακυρωθηκε": "Cancelled",
};

const IT: Record<string, string> = {
  "σε επεξεργασια": "In elaborazione",
  "σε προετοιμασια": "In preparazione",
  "σε αναμονη": "In attesa",
  "ετοιμη για αποστολη": "Pronto per la spedizione",
  "εσταλη": "Spedito",
  "απεσταλη": "Spedito",
  "παραδωση σε courier": "Consegnato al corriere",
  "παραδοση σε courier": "Consegnato al corriere",
  "παραδωση σε πελατη": "Consegnato al cliente",
  "παραδοση σε πελατη": "Consegnato al cliente",
  "παραδοθηκε": "Consegnato",
  "ολοκληρωθηκε": "Completato",
  "ακυρωθηκε": "Annullato",
};

const FALLBACK: Record<string, string> = {
  en: "Your order status has changed",
  it: "Lo stato del tuo ordine è cambiato",
};

export function statusNameFor(locale: string, name: string): string {
  if (locale === "el") return name;
  const table = locale === "it" ? IT : EN;
  return table[norm(name)] ?? FALLBACK[locale] ?? FALLBACK.en;
}
