import { SHOP } from "@/config/shop";

/**
 * Ποιο κατάστημα περιγράφουν τα AI κείμενα (newsletter, banners, πεδία
 * περιεχομένου). Μία περιγραφή για όλα τα prompts, χτισμένη από το `SHOP`, ώστε
 * διεύθυνση, ωράριο και επωνυμία να αλλάζουν σε ένα σημείο.
 */

const { street, postcode, hours } = SHOP.contact;
const postcodeAsPrinted = `${postcode.slice(0, 3)} ${postcode.slice(3)}`;
const span = (h: { open: string; close: string } | null) => (h ? `${h.open}–${h.close}` : "κλειστά");

export const STORE_BRIEF = [
  `${SHOP.name}: κατάστημα εργαλείων Milwaukee στον Πειραιά (${street}, ${postcodeAsPrinted}).`,
  "Πουλά μόνο Milwaukee: εργαλεία μπαταρίας M12/M18/MX FUEL, αξεσουάρ, εργαλεία χειρός, PACKOUT.",
  "Παραλαβή από το κατάστημα ή αποστολή σε όλη την Ελλάδα.",
  `Ωράριο: Δευτέρα–Παρασκευή ${span(hours.weekdays)}, Σάββατο ${span(hours.saturday)}.`,
  `Εταιρεία: ${SHOP.operator.name}.`,
].join(" ");

/** Κανόνας για κάθε prompt (spec Δ5). */
export const NEVER_DEALER = 'Μη γράφεις ποτέ "εξουσιοδοτημένος αντιπρόσωπος".';
