/**
 * Ό,τι χρειάζονται ΚΑΙ ο server ΚΑΙ ο browser από την καμπάνια.
 *
 * ── Γιατί ξεχωριστό αρχείο ─────────────────────────────────────────────────
 *
 * Το `campaign.ts` εισάγει τον renderer, που εισάγει `server-only`, που εισάγει
 * `node:fs`. Ο wizard είναι client component και χρειαζόταν ΜΙΑ σταθερά από
 * εκεί — τις προεπιλογές κειμένων. Αυτό αρκούσε για να τραβήξει ολόκληρη την
 * αλυσίδα στο bundle του browser και να σπάσει το build:
 *
 *   «You're importing a module that depends on "server-only"»
 *
 * Οι τύποι δεν φταίνε — σβήνονται στη μεταγλώττιση. Φταίει η ΤΙΜΗ. Οπότε ό,τι
 * είναι τιμή και το θέλουν και οι δύο πλευρές ζει εδώ, χωρίς καμία εισαγωγή
 * που να μυρίζει server.
 */

/**
 * The fixed words of the product newsletters that an editor may override: the
 * section title and the button under the grid. Shown as placeholders in the
 * wizard; an empty or unchanged field means «the template's own words in the
 * reader's language» (lib/mail/hdc/strings), so a Greek override is never
 * forced on an English subscriber by accident. The template upper-cases them.
 *
 * `hero_button`, `section_eyebrow` and `section_link` belonged to the Kolleris
 * layout and are ignored by the HDC one; kept so older campaigns still parse.
 */
export const DEFAULT_COPY = {
  hero_button: "",
  section_eyebrow: "",
  section_title: "Οι προσφορές του μήνα",
  section_link: "",
  all_button: "Όλες οι προσφορές",
  /* Το μπάνερ B2B αποσύρθηκε (το HDC πουλά μόνο σε ιδιώτες): κενό κουμπί
     σημαίνει ότι το πρότυπο δεν το αποδίδει καθόλου. */
  b2b_eyebrow: "",
  b2b_button: "",
} as const;

export type CampaignCopy = Partial<Record<keyof typeof DEFAULT_COPY, string>>;

export type PickedProduct = {
  id: string;
  slug: string;
  name: string;
  code: string;
  brand: string;
  image: string;
  price: string;
  priceOld: string;
  discount: string;
  stockLabel: string;
  url: string;
  /* Raw facts, so each language writes its own price and availability.
     Missing on campaigns saved before the HDC templates: the strings above are used. */
  /** Manufacturer code (code2), what the card prints. */
  code2?: string;
  priceGross?: number;
  priceOldGross?: number;
  availability?: "se_apothema" | "teleftaio" | "diathesimo_3_5" | "paradosi_1_3";
  /** «M18 FUEL», «PACKOUT»… from the name; null when none. */
  tag?: string | null;
  /** A bare tool: «Χωρίς μπαταρία». */
  bare?: boolean;
};

/**
 * Το περιεχόμενο του newsletter «Νέα».
 *
 * Δομημένο και όχι ελεύθερο HTML, επειδή έτσι είναι φτιαγμένο το πρότυπο: κάθε
 * άρθρο παίρνει τη δική του εικόνα, ετικέτα και σύνδεσμο, και η διάταξη κρατιέται
 * από πίνακες που το Outlook καταλαβαίνει. Ένα κουτί ελεύθερου κειμένου θα
 * έδινε στον συντάκτη ελευθερία που το email δεν μπορεί να αποδώσει.
 */
export type NewsArticle = {
  id: string;
  title: string;
  excerpt: string;
  tag: string;
  image: string;
  url: string;
  cta: string;
};

export type NewsContent = {
  issue: { label: string; number: string; title: string; intro: string };
  hero: {
    eyebrow: string;
    title_before: string;
    title_accent: string;
    title_after: string;
    text: string;
    image: string;
    image_alt: string;
    cta: string;
    url: string;
  };
  articles: NewsArticle[];
};

export const EMPTY_NEWS: NewsContent = {
  issue: { label: "Newsletter", number: "", title: "", intro: "" },
  hero: {
    eyebrow: "",
    title_before: "",
    title_accent: "",
    title_after: "",
    text: "",
    image: "",
    image_alt: "",
    cta: "Δειτε περισσοτερα",
    url: "",
  },
  articles: [],
};

export type CampaignPayload = {
  campaign: {
    eyebrow: string;
    discount: string;
    title: string;
    text: string;
    url: string;
    valid_until: string;
    /** Banner picture next to the headline (absolute URL). Optional. */
    image?: string;
  };
  products: PickedProduct[];
  /** Ελεύθερο κείμενο από τον editor, ήδη ως HTML. */
  bodyHtml?: string;
  /** Παρακάμψεις των σταθερών κειμένων. Κενό = οι προεπιλογές. */
  copy?: CampaignCopy;
  /** Περιεχόμενο για τα πρότυπα «Νέα» και «Ανακοίνωση». */
  news?: NewsContent;
};

export type TemplateMeta = {
  id: string;
  name: string;
  category: string;
  categoryTitle: string;
  subject: string;
  preheader: string;
  takesProducts: boolean;
  takesRichText: boolean;
};

export type ProductFilters = {
  query?: string;
  mtrmark?: number | null;
  onSaleOnly?: boolean;
  inStockOnly?: boolean;
};
