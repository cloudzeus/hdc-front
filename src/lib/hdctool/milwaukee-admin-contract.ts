/**
 * Το συμβόλαιο του API `/api/hdc-admin/milwaukee/*` του HDCtool: τύποι,
 * ελληνικές ετικέτες και οι τύποι τιμής που χρειάζεται ο browser.
 *
 * ΑΝΤΙΓΡΑΦΗ από το HDCtool (hdckolleris), ΠΡΕΠΕΙ ΝΑ ΜΕΝΕΙ ΣΕ ΣΥΜΦΩΝΙΑ:
 * - `src/lib/milwaukee-xml-admin-shared.ts` (τύποι, ετικέτες, όρια, βοηθητικά)
 * - `src/lib/milwaukee-xml-erp.ts` (`ErpPreview`, `ErpRegisterResult`)
 * - `src/lib/milwaukee-xml-erp-plan.ts` (`ErpCreatePayload`, `ErpItemState`)
 * - `src/lib/milwaukee-official.ts` (`OfficialSearchResult`)
 * - `src/lib/milwaukee-xml-description.ts`, `milwaukee-xml-availability.ts`,
 *   `milwaukee-xml-category.ts` (`XmlContent`, `AvailabilityState`, `MissingField`)
 * Οι τύποι τιμής είναι στο `milwaukee-admin-pricing.ts` (με τεστ ισοδυναμίας).
 *
 * Χωρίς `server-only`: το εισάγουν και τα client components. Κανένα μυστικό εδώ.
 */

// ---------------------------------------------------------------------------
// Βασικοί τύποι
// ---------------------------------------------------------------------------

export type XmlItemStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type XmlPricingMode = "SUGGESTED" | "MARKUP" | "MANUAL";
export type XmlMissing = "name" | "category" | "subgroup" | "price";
export type XmlContentSource = "parsed" | "official" | "ai" | "manual";
export type XmlSpec = { label: string; value: string };
export type XmlContent = { features: string[]; specs: XmlSpec[] };
export type AvailabilityState = "stock" | "supplier" | "order";

export const MAX_TEXT = 500;
export const MAX_FEATURES = 60;
export const MAX_SPECS = 80;
export const MAX_BULK = 500;
/** Το πλήθος που δέχεται η μαζική «Καταχώριση στο SoftOne» (σειριακά, ένα-ένα). */
export const MAX_ERP_BULK = 20;
/** Μετά από τόσες αποτυχίες η αυτόματη ανάλυση παρακάμπτει το item. */
export const MAX_ANALYSIS_ATTEMPTS = 3;

export const STATUS_LABEL: Record<XmlItemStatus, string> = {
  DRAFT: "Πρόχειρο",
  ACTIVE: "Ενεργό",
  ARCHIVED: "Αποσυρμένο",
};

export const MISSING_LABEL: Record<XmlMissing, string> = {
  name: "όνομα",
  category: "κατηγορία/ομάδα",
  subgroup: "υποομάδα",
  price: "τιμή",
};

export const LEVEL_LABEL: Record<string, string> = {
  name: "ίδιο είδος κατά όνομα",
  subgroup: "ίδια υποομάδα",
  group: "ίδια ομάδα",
  xmlCategory: "ίδια κατηγορία XML",
  all: "όλα — χαμηλή βεβαιότητα",
};

export const CONTENT_SOURCE_LABEL: Record<XmlContentSource, string> = {
  parsed: "από το XML",
  official: "Επίσημα Milwaukee",
  ai: "AI, επαληθευμένο",
  manual: "χειροκίνητο",
};

export const AVAILABILITY_LABEL: Record<AvailabilityState, string> = {
  stock: "Σε απόθεμα",
  supplier: "3–5 εργάσιμες",
  order: "1–3 εργάσιμες",
};

// ---------------------------------------------------------------------------
// Διαθεσιμότητα
// ---------------------------------------------------------------------------

/** Γραμμή του `GET availability`. */
export type AvailabilityRow = {
  mtrl: number;
  code2: string;
  name: string;
  sellable: number;
  supplierAvailable: boolean;
  state: AvailabilityState;
  eshopListed: boolean;
  priceWeb: number | null;
};

export type AvailabilityCounts = Record<AvailabilityState, number> & { xmlOnly: number };

// ---------------------------------------------------------------------------
// Προϊόντα μόνο-XML
// ---------------------------------------------------------------------------

/** Γραμμή του `GET items` (χωρίς το βαρύ περιεχόμενο). */
export type XmlItemRow = {
  id: string;
  feedSeq: number;
  supXmlCode: string;
  alternativeCode: string;
  barcode: string | null;
  status: XmlItemStatus;
  nameEl: string;
  nameEn: string | null;
  nameIt: string | null;
  milwaukeeCategoryId: string | null;
  /** Ταξινόμηση SoftOne (αναγνωριστικά). */
  mtrcategory: number | null;
  mtrgroup: number | null;
  cccSubgroup2: number | null;
  costNet: number;
  supplierInStock: boolean;
  pricingMode: XmlPricingMode;
  markupPct: number | null;
  priceW: number | null;
  utbl02: number;
  suggestedRatio: number | null;
  suggestedLevel: string | null;
  mtrl: number | null;
  contentSource: XmlContentSource | null;
  descriptionHadTable: boolean;
  discrepancyCount: number;
  analysisAttempts: number;
  analysisError: string | null;
  xmlTitle: string | null;
  xmlCategory: string | null;
  image: string | null;
  /** «Κατηγορία › Ομάδα › Υποομάδα» από τους πίνακες του SoftOne. */
  categoryPath: string | null;
  /** Ο κόμβος δεν υπάρχει ακόμα στο δέντρο του eshop (θα δημιουργηθεί με την ενεργοποίηση). */
  treeMissing: boolean;
  eshopPrice: number | null;
  marginPct: number | null;
  missing: XmlMissing[];
  publishable: boolean;
};

/** Κόμβος των πινάκων ταξινόμησης του SoftOne για τα πεδία επιλογής. */
export type SoftOneNode = {
  /** Αριθμητικό αναγνωριστικό, όπως μπαίνει στο MTRL. */
  id: number;
  /** Ο κωδικός που βλέπει ο χρήστης στο SoftOne (CODE/SHORT). */
  code: string;
  name: string;
  inMilwaukeeTree: boolean;
  /** Είδη Milwaukee του MTRL σε αυτόν τον κόμβο. */
  milwaukeeCount: number;
};
export type SoftOneCategories = {
  categories: SoftOneNode[];
  groups: Array<SoftOneNode & { categoryId: number; hasSubgroups: boolean }>;
  subgroups: Array<SoftOneNode & { groupId: number }>;
};

/** Επιλογή κατηγορίας από τη σελίδα (αναγνωριστικά SoftOne). */
export type CategoryChoice = { mtrcategory: number; mtrgroup: number; cccSubgroup2: number | null };

/**
 * Ταξινόμηση για τα πεδία επιλογής: πρώτα όσα έχουν ήδη είδη Milwaukee (με
 * περισσότερα πρώτα), μετά όλα τα υπόλοιπα του SoftOne αλφαβητικά.
 */
export function sortForPicker<T extends SoftOneNode>(nodes: T[]): T[] {
  return [...nodes].sort(
    (a, b) =>
      Number(b.milwaukeeCount > 0) - Number(a.milwaukeeCount > 0) ||
      b.milwaukeeCount - a.milwaukeeCount ||
      a.name.localeCompare(b.name, "el"),
  );
}

/** Λεπτομέρειες ενός item για το πλαϊνό πάνελ (`GET items/[id]`). */
export type XmlItemDetail = XmlItemRow & {
  contentEl: XmlContent | null;
  contentEn: XmlContent | null;
  contentIt: XmlContent | null;
  discrepancies: Array<{ label: string; xmlValue: string }>;
  officialUrl: string | null;
  contentAnalyzedAt: string | null;
  gallery: string[];
  descriptionText: string | null;
  shortDescriptionText: string | null;
  /** Γιατί δεν μπορεί να γίνει «Καταχώριση στο SoftOne» (κενό = μπορεί). */
  erpBlockers: string[];
  createdInSoftOneAt: string | null;
  createdInSoftOneBy: string | null;
};

/** «Απάντηση DeepSeek»: η καταγραφή της τελευταίας ανάλυσης (`analysisRaw`). */
export type AnalysisRawView = {
  analysisRaw: unknown;
  analysisError: string | null;
  analysisAttempts: number;
  contentAnalyzedAt: string | null;
  contentSource: string | null;
};

export type OfficialSpecView = { name: string; value: string; unit: string | null };

/** «Επίσημα δεδομένα Milwaukee»: η γραμμή του κωδικού και η κατάσταση του ευρετηρίου. */
export type OfficialView = {
  articleNumber: string;
  product: {
    articleNumber: string;
    model: string | null;
    ean: string | null;
    groupName: string | null;
    url: string;
    imageUrl: string | null;
    fetchedAt: string;
    itCheckedAt: string | null;
    specsEn: OfficialSpecView[];
    specsIt: OfficialSpecView[] | null;
  } | null;
  index: { pages: number; fetchedPages: number; products: number; lastFetchedAt: string | null; crawling: boolean };
};

/** Αποτέλεσμα της «Αναζήτησης στο επίσημο site» (`POST items/[id]/official-search`). */
export type OfficialSearchResult = {
  slugs: string[];
  candidates: string[];
  pages: Array<{ url: string; status: number | null; variants: number; articleNumbers: string[] }>;
  /** Βρέθηκε ο κωδικός που ζητήθηκε. */
  found: boolean;
  /** Γιατί σταμάτησε (429/5xx/δίκτυο), αλλιώς `null`. */
  stoppedBy: string | null;
  sitemapCached: boolean;
};

export type PeersSuggestion = {
  ratio: number;
  level: string;
  lowConfidence: boolean;
  utbl02: number;
  peers: Array<{ mtrl: number; code2: string | null; name: string; costNet: number; priceW: number; ratio: number }>;
} | null;

/** Γραμμή του λεξικού ετικετών των επίσημων τεχνικών (`GET spec-labels`). */
export type SpecLabelRow = {
  en: string;
  el: string | null;
  proposedEl: string | null;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  uses: number;
};

/**
 * Το patch του `POST items/[id]` (`updateXmlItem`). `category`: επιλογή ή
 * `null` για καθάρισμα· χωρίς κανένα πεδίο το HDCtool απαντά 400 «Κενή αλλαγή».
 */
export type ItemPatch = {
  nameEl?: string;
  nameEn?: string | null;
  nameIt?: string | null;
  pricingMode?: XmlPricingMode;
  markupPct?: number | null;
  priceW?: number | null;
  utbl02?: number;
  category?: CategoryChoice | null;
};

/** Σώμα του `POST items/[id]/content`: και οι τρεις γλώσσες. */
export type ItemContent = Record<"el" | "en" | "it", XmlContent>;

// ---------------------------------------------------------------------------
// Καταχώριση στο SoftOne
// ---------------------------------------------------------------------------

/** Το σώμα του `setData` (χωρίς clientID/appId), ακριβώς όπως φεύγει. */
export type ErpCreatePayload = {
  OBJECT: "ITEM";
  data: { ITEM: [Record<string, unknown>]; ITEEXTRA?: [Record<string, number>] };
};

/** Ό,τι χρειάζεται η σύνδεση από ένα υπάρχον είδος του SoftOne. */
export type ErpItemState = {
  code: string;
  name: string;
  priceW: number | null;
  mtrcategory: number | null;
  mtrgroup: number | null;
  cccSubgroup2: number | null;
  bool01: number | null;
  isActive: number | null;
};

/** Η προεπισκόπηση (`GET items/[id]/erp-preview`), επιτυχής μορφή. */
export type ErpPreviewOk =
  | {
      mode: "create";
      code: string;
      payload: ErpCreatePayload;
      publish: boolean;
      notes: string[];
      fingerprint: string;
    }
  | {
      mode: "link";
      mtrl: number;
      erp: ErpItemState;
      incomplete: string[];
      changes: string[];
      publish: boolean;
      notes: string[];
      fingerprint: string;
    };

/** Σώμα του `POST items/[id]/erp-register`. */
export type ErpRegisterInput = { fingerprint: string; code?: string; acceptWithdrawal?: boolean };

/** Αποτέλεσμα του `POST items/[id]/erp-register`, επιτυχής μορφή. */
export type ErpRegisterOk = {
  mode: "created" | "linked";
  mtrl: number;
  code: string;
  eshopListed: boolean;
  /** Σοβαρά: το SoftOne δεν έγραψε κάτι που επηρεάζει τιμή ή δημοσίευση. */
  alerts: string[];
  warnings: string[];
};

/* Ίδιο κείμενο με τον server (`WITHDRAWAL_CONSENT` στο milwaukee-xml-erp). */
export const WITHDRAWAL_CONSENT =
  "Κατανοώ ότι το προϊόν θα αποσυρθεί από το eshop μέχρι να συμπληρωθεί στο SoftOne";

// ---------------------------------------------------------------------------
// Εικόνα προόδου (`GET overview`)
// ---------------------------------------------------------------------------

/** Μια εκτέλεση εργασίας από το `MilwaukeeJobRun`. */
export type MilwaukeeJobRunView = {
  startedAt: string;
  finishedAt: string | null;
  /** Ό,τι επέστρεψε η εργασία (μετρητές· `stoppedBy` για τη σάρωση). */
  stats: unknown;
  error: string | null;
};

export type MilwaukeeOverview = {
  generatedAt: string;
  items: {
    total: number;
    draft: number;
    active: number;
    archived: number;
    /** Δημοσιεύσιμα στο eshop από το XML (`isPublishable`). */
    inEshop: number;
    /** Με MTRL (καταχωρισμένα ή συνδεδεμένα στο SoftOne). */
    inSoftOne: number;
    withDiscrepancies: number;
    withoutCategory: number;
  };
  analysis: {
    /** Με `contentAnalyzedAt`. */
    done: number;
    /** Όσα θα έπαιρνε η παρτίδα (`needsAnalysis`). */
    pending: number;
    /** Στο όριο αποτυχιών (`analysisAttempts >= 3`). */
    failed: number;
    lastAt: string | null;
    running: boolean;
    lastRun: MilwaukeeJobRunView | null;
  };
  official: {
    pagesTotal: number;
    pagesFetched: number;
    productsIndexed: number;
    /** Κωδικοί που μας αφορούν, στο ευρετήριο χωρίς ιταλικά τεχνικά. */
    italianMissing: number;
    lastRunAt: string | null;
    /** Γιατί σταμάτησε η τελευταία σάρωση πριν τελειώσει (ή το σφάλμα της), αλλιώς null. */
    lastStoppedBy: string | null;
    running: boolean;
    lastRun: MilwaukeeJobRunView | null;
  };
  labels: { pending: number; approved: number };
  xmlSync: { lastAt: string | null; stats: unknown; error: string | null; running: boolean };
};
