/**
 * The Milwaukee technologies, as our own published guide explains them
 * (docs/content/news/17-lexiko-texnologion-milwaukee/el.md, written from the
 * official Milwaukee Europe pages). Every `text` is copied verbatim from that
 * guide — the test checks it — so a statement here is as vetted as the guide.
 *
 * Only the entries that concern the products of a fact pack go into it; the
 * verifier treats them as supported, and their numbers support the text.
 */

export type GlossaryEntry = { term: string; text: string };

/** What a pack's products look like to the glossary. */
export type GlossarySubject = {
  platform: string | null;
  fuel: boolean;
  oneKey: boolean;
  /** Everything else the pack says about the product: name, model, kit, specs, description. */
  text: string;
};

type Entry = GlossaryEntry & { applies: (s: GlossarySubject) => boolean };

const says = (s: GlossarySubject, re: RegExp) => re.test(s.text);

const ENTRIES: readonly Entry[] = [
  {
    term: "M12",
    text: "M12: η υπο-compact πλατφόρμα 12 V, με περισσότερες από 125 λύσεις κατά τη Milwaukee. Για στενά σημεία και ελαφριά δουλειά όλη μέρα.",
    applies: (s) => s.platform === "M12",
  },
  {
    term: "M18",
    text: "M18: η πλατφόρμα 18 V, με πάνω από 325 λύσεις. Κάθε μπαταρία M18 ταιριάζει σε κάθε εργαλείο M18.",
    applies: (s) => s.platform === "M18",
  },
  {
    term: "MX FUEL",
    text: "MX FUEL: η πλατφόρμα για ελαφρύ εξοπλισμό εργοταξίου, με πάνω από 25 λύσεις και δικές της μπαταρίες. Κατά τη Milwaukee, χωρίς καυσαέρια.",
    applies: (s) => s.platform === "MX FUEL" || s.platform === "MX",
  },
  {
    term: "M12-18",
    text: "Οι φορτιστές M12-18 φορτίζουν και M12 και M18· οι μπαταρίες όμως δεν ανταλλάσσονται μεταξύ πλατφορμών.",
    applies: (s) => says(s, /\bM12-18\b/i),
  },
  {
    term: "FUEL",
    text: "FUEL είναι η κορυφαία σειρά των M12 και M18. Ένα εργαλείο είναι FUEL όταν συνδυάζει τον brushless κινητήρα POWERSTATE, την μπαταρία REDLITHIUM και τα ηλεκτρονικά REDLINK PLUS της Milwaukee.",
    applies: (s) => s.fuel && (s.platform === "M12" || s.platform === "M18"),
  },
  {
    term: "POWERSTATE",
    text: "POWERSTATE: ο brushless κινητήρας που σχεδιάζει και κατασκευάζει η Milwaukee για τα δικά της εργαλεία. Χωρίς καρβουνάκια, άρα χωρίς αλλαγή ψηκτρών, με λιγότερη τριβή και θερμότητα.",
    applies: (s) => s.fuel || says(s, /POWERSTATE/i),
  },
  {
    term: "REDLINK PLUS",
    text: "REDLINK PLUS: τα ηλεκτρονικά που βάζουν εργαλείο και μπαταρία να «μιλούν». Προστατεύουν από υπερφόρτωση και, αν η μπαταρία υπερθερμανθεί, τη σβήνουν μέχρι να κρυώσει.",
    applies: (s) => s.fuel || says(s, /REDLINK/i),
  },
  {
    term: "REDLITHIUM",
    text: "REDLITHIUM: η τεχνολογία μπαταριών της Milwaukee. Κατά την εταιρεία, οι μπαταρίες M18 REDLITHIUM δουλεύουν ως τους -20 °C, ενώ οι συνηθισμένες σταματούν γύρω στους -6 °C. Τα μεγάλα ελάσματα συγκόλλησης μειώνουν την αντίσταση και απάγουν τη θερμότητα στο περίβλημα.",
    applies: (s) => s.fuel || says(s, /REDLITHIUM/i),
  },
  {
    term: "HIGH OUTPUT",
    text: "HIGH OUTPUT: μπαταρίες (κωδικοί HB) με κυψέλες χωρίς ελάσματα. Κατά τη Milwaukee, έως 50% περισσότερη ισχύς και έως 50% πιο δροσερή λειτουργία από την απλή REDLITHIUM.",
    applies: (s) => says(s, /HIGH OUTPUT|\bM1[28]\s?HB\d/i),
  },
  {
    term: "FORGE",
    text: "FORGE: η κορυφαία κατηγορία (κωδικοί FB στο M18, όπως FB6, FB8 και FB12· στο MX FUEL, για παράδειγμα, οι HD812 και XC608). Για το M18 η Milwaukee αναφέρει 50% περισσότερη ισχύ από την M18 HB12, 45% λιγότερη θερμότητα και φόρτιση στο 80% σε 35 λεπτά.",
    applies: (s) => says(s, /FORGE|\bM18\s?FB\d/i),
  },
  {
    term: "ONE-KEY",
    text: "ONE-KEY: η δωρεάν πλατφόρμα της Milwaukee στο cloud για απογραφή, εντοπισμό και ρύθμιση εργαλείων από κινητό, tablet ή υπολογιστή. Στα εργαλεία ONE-KEY (συχνά με πρόθεμα ONE, όπως M18 ONEPD3) μπορείτε να αλλάξετε ρυθμίσεις και να τα κλειδώσετε από απόσταση.",
    applies: (s) => s.oneKey || says(s, /ONE-KEY/i),
  },
  {
    term: "PACKOUT",
    text: "PACKOUT: το αρθρωτό σύστημα αποθήκευσης της Milwaukee. Τρόλεϊ, εργαλειοθήκες PACKOUT, συρταριέρες και ταμπακιέρες κουμπώνουν σε μία στοίβα. Κατά τη Milwaukee το τρόλεϊ σηκώνει έως 113 kg, με στεγάνωση IP65.",
    applies: (s) => says(s, /PACKOUT/i),
  },
];

/** Every entry, for the test. */
export const GLOSSARY: readonly GlossaryEntry[] = ENTRIES.map(({ term, text }) => ({ term, text }));

/** The entries that concern at least one of these products, in the glossary's order. */
export function glossaryFor(subjects: GlossarySubject[]): GlossaryEntry[] {
  return ENTRIES.filter((e) => subjects.some((s) => e.applies(s))).map(({ term, text }) => ({ term, text }));
}
