import type { ResolvedCell } from "@/lib/banners/resolve-tokens";

/**
 * Οι τιμές δείγματος της γκαλερί παραλλαγών, ώστε μια μικρογραφία να διαβάζεται
 * ως σχέδιο και όχι ως `{title}`.
 *
 * Το δείγμα είναι πραγματικό προϊόν Milwaukee του καταλόγου, λυμένο από τον ίδιο
 * resolver που χρησιμοποιεί ο editor (`actionDemoCell`). Το στατικό εδώ είναι
 * μόνο ό,τι φαίνεται μέχρι να έρθει εκείνο, ή αν ο κατάλογος είναι άδειος: χωρίς
 * εικόνα, γιατί μια καρφωτή διεύθυνση φωτογραφίας παλιώνει μαζί με τον κατάλογο.
 */
export const STATIC_DEMO: ResolvedCell = {
  tokens: {
    "{title}": "M18 FUEL δραπανοκατσάβιδο",
    "{brand}": "MILWAUKEE",
    "{code}": "M18 FDD3",
    "{price}": "329,00 €",
    "{compare}": "389,00 €",
    "{desc}": "Επαγγελματικό εργαλείο μπαταρίας M18 FUEL.",
    "{badge}": "-15%",
    "{ends}": "3 ημέρες",
    "{image}": "",
    "{brandLogo}": "",
  },
  href: "#",
  image: "",
  items: [],
};

/**
 * Ενώνει το λυμένο προϊόν και το λυμένο σύνολο σε ένα δείγμα.
 *
 * Ό,τι δεν δίνει ένα απλό προϊόν (σήμανση, λήξη, τιμή πριν όταν δεν έχει
 * έκπτωση) μένει από το στατικό, αλλιώς οι παραλλαγές που το χρησιμοποιούν
 * δείχνουν κενό στη γκαλερί.
 */
export function mergeDemo(product: ResolvedCell | undefined, set: ResolvedCell | undefined): ResolvedCell {
  if (!product) return STATIC_DEMO;
  const tokens = { ...STATIC_DEMO.tokens };
  for (const [key, value] of Object.entries(product.tokens)) if (value) tokens[key] = value;
  return {
    tokens,
    href: "#",
    image: product.image,
    items: set?.items?.length ? set.items : STATIC_DEMO.items,
  };
}
