import { searchKey } from "@/lib/greek";
import { DEALER_WORDING } from "@/lib/seo/dealer-wording";
import { ANSWER_WORDS, DESCRIPTION_MAX, TITLE_MAX, words } from "@/lib/seo/seo-checks";
import {
  DUPLICATE_AT,
  codeMentions,
  modelMentions,
  similarity,
  unsupportedNumbers,
} from "@/lib/content-auto/text";

/**
 * The checks an automatic article must pass to be published (spec §6 and the
 * review of 30/9/2026). All of them, every time: one failure leaves the text a
 * DRAFT and the email says which one. Pure — the runner gathers what they need
 * from the database.
 *
 * The text checks read EVERYTHING the article carries: title, <title>, meta,
 * answer, body (code spans and fences included), FAQ, keywords, entities, the
 * hero's alt and every inline image's alt. Only the targets of Markdown links
 * and images are left out of the word checks — the links gate reads those.
 */

export type GateId =
  | "numbers"
  | "codes"
  | "forbidden"
  | "bareKit"
  | "aiTells"
  | "links"
  | "lengths"
  | "language"
  | "unique"
  | "verifier"
  | "image";

export type GateResult = { id: GateId; ok: boolean; problems: string[] };

export const GATE_LABELS: Record<GateId, string> = {
  numbers: "Αριθμοί από το πακέτο",
  codes: "Κωδικοί και μοντέλα του καταλόγου",
  forbidden: "Απαγορευμένα (τιμές, απόθεμα, αντιπρόσωπος, χονδρική, άλλες μάρκες)",
  bareKit: "Σκέτο εργαλείο χωρίς μπαταρίες",
  aiTells: "Κλισέ AI",
  links: "Σύνδεσμοι",
  lengths: "Μήκη",
  language: "Γλώσσα",
  unique: "Μοναδικότητα",
  verifier: "Έλεγχος ισχυρισμών",
  image: "Φωτογραφία",
};

export type Draft = {
  title: string;
  seoTitle: string;
  metaDescription: string;
  answer: string;
  body: string;
  faq: Array<{ q: string; a: string }>;
  keywords: string[];
  entities: string[];
};

/** What a reader sees: title, <title>, meta, answer, body, FAQ. */
export function visibleText(d: Pick<Draft, "title" | "seoTitle" | "metaDescription" | "answer" | "body" | "faq">): string {
  return [d.title, d.seoTitle, d.metaDescription, d.answer, d.body, ...d.faq.flatMap((p) => [p.q, p.a])].join("\n\n");
}

/** Everything the article carries: the visible text, keywords, entities and the alts. */
export function allText(d: Draft, alts: string[] = []): string {
  return [visibleText(d), ...d.keywords, ...d.entities, ...alts].join("\n\n");
}

/** Link and image TARGETS out; their text and alt stay. Code is NOT stripped: it is read too. */
function readable(text: string): string {
  return text.replace(/\]\([^)]*\)/g, "]");
}

const gate = (id: GateId, problems: string[]): GateResult => ({ id, ok: problems.length === 0, problems: [...new Set(problems)].slice(0, 20) });

// 1. Numbers ─────────────────────────────────────────────────────────────────

export function numbersGate(draft: Draft, supported: Set<string>, alts: string[] = []): GateResult {
  return gate(
    "numbers",
    unsupportedNumbers(readable(allText(draft, alts)), supported).map((m) => `«${m}» δεν υπάρχει στο πακέτο στοιχείων`),
  );
}

// 2. Codes and models ────────────────────────────────────────────────────────

export type Catalogue = {
  /** code2 and code1 of every active product. */
  codes: Set<string>;
  /** «M18 FPD3» — every model root that appears in an active product's name. */
  roots: Set<string>;
  /** «M18 FPD3-502X» — every full model code that appears in one. */
  fullCodes: Set<string>;
};

/**
 * `packText`: the fact pack as text. A code or model the pack names verbatim
 * (a kit's battery «M18 HB8» in its contents) is as good as a catalogue one.
 */
export function codesGate(draft: Draft, catalogue: Catalogue, alts: string[] = [], packText = ""): GateResult {
  const text = readable(allText(draft, alts));
  const packCodes = new Set(codeMentions(packText));
  const packModels = new Set(modelMentions(packText).flatMap((m) => (m.full ? [m.full, m.root] : [m.root])));
  const problems: string[] = [];
  for (const code of codeMentions(text)) {
    if (!catalogue.codes.has(code) && !packCodes.has(code)) problems.push(`Ο κωδικός ${code} δεν υπάρχει στον κατάλογο ούτε στο πακέτο`);
  }
  for (const m of modelMentions(text)) {
    const known = m.full ? catalogue.fullCodes.has(m.full) || packModels.has(m.full) : catalogue.roots.has(m.root) || packModels.has(m.root);
    if (!known) problems.push(`Το μοντέλο ${m.full ?? m.root} δεν υπάρχει στον κατάλογο ούτε στο πακέτο`);
  }
  return gate("codes", problems);
}

// 3. Forbidden ───────────────────────────────────────────────────────────────
//
// Read on `searchKey` of the text: lower case, no accents, ς folded to σ. So
// «ΤΙΜΗ», «Τιμή» and «τιμη» are one word. Greek stems get explicit edges
// (`\b` is ASCII-only even with the `u` flag).

const start = "(?<!\\p{L})";
const end = "(?!\\p{L})";
const folded = (body: string) => new RegExp(body, "u");

export const PRICE = folded(`€|&#8364;|\\$|${start}(?:τιμη|τιμεσ|τιμων|τιμησ|ευρω|eur|euro)${end}|${start}κοστιζ`);
/** «μετρητής αποθέματος» is the fuel gauge of a battery, not stock. */
export const STOCK = folded(
  `${start}(?<!μετρητ\\p{L}{0,3}\\s)αποθεμ|${start}τεμαχ|${start}κομματια${end}|${start}διαθεσιμοτητ|αμεσα\\s+διαθεσιμ|${start}ετοιμοπαραδοτ|περιορισμενη\\s+ποσοτητα|σε\\s+αποθεμα|σε\\s+στοκ|in\\s+stock`,
);
/**
 * Wholesale. «χοντρ-» alone is not here: the 55 hand-written guides say
 * «χοντρό/χοντρά» (thick) about 90 times; «χοντρική» is.
 */
export const WHOLESALE = folded(`${start}(?:χονδρ|χοντρικ)|wholesale|${start}b2b${end}|${start}εταιρικ\\p{L}*\\s+πελατ|${start}μεταπωλητ|reseller`);
export const OTHER_BRANDS = folded(
  `${start}(?:makita|dewalt|de\\s?walt|bosch|hilti|metabo|festool|ryobi|einhell|stanley|black\\s*(?:\\+|&|and)\\s*decker|hikoki|hitachi|fein|aeg|worx|parkside|ridgid|kress|mafell|dremel|skil|flex|knipex|wera|wiha|stihl|husqvarna|μακιτα|μποσ|ντεγουολτ|ντε\\s?γουολτ|χιλτι|μεταμπο|ριομπι|αινχελ|στανλει)${end}`,
);

export function forbiddenGate(draft: Draft, alts: string[] = []): GateResult {
  const raw = readable(allText(draft, alts));
  const text = searchKey(raw);
  const problems: string[] = [];
  const hit = (re: RegExp, what: string, on = text) => {
    const m = re.exec(on);
    if (m) problems.push(`${what}: «${m[0].trim()}»`);
  };
  hit(PRICE, "Τιμή");
  hit(STOCK, "Απόθεμα ή ποσότητα");
  hit(DEALER_WORDING, "Δήλωση αντιπροσώπου");
  if (!problems.some((p) => p.startsWith("Δήλωση"))) hit(DEALER_WORDING, "Δήλωση αντιπροσώπου", raw);
  hit(WHOLESALE, "Χονδρική / B2B");
  hit(OTHER_BRANDS, "Άλλη μάρκα");
  return gate("forbidden", problems);
}

// 4. A bare tool comes without batteries ─────────────────────────────────────

const BARE_MODEL = /-0[XC]?$/;
const BATTERY_CLAIM = folded(
  `\\d\\s*[x×]?\\s*μπαταρ|${start}(?:μια|μιασ|ενα|δυο|τρεισ|τρια|τεσσερισ)\\s+μπαταρ|\\d\\s?ah${end}|${start}φορτιστ|m12-18\\s?f?c|${start}charger|\\d\\s*[x×]?\\s*batter`,
);

/**
 * A backstop under the fact pack's filter: a sentence (or table row) that
 * names a bare model (-0, -0X, -0C) must not give it a battery count, a
 * capacity or a charger — unless it says «χωρίς».
 */
export function bareKitGate(draft: Draft, alts: string[] = []): GateResult {
  const problems: string[] = [];
  const sentences = readable(allText(draft, alts)).split(/(?<=[.!;?·])\s+|\n+/);
  for (const sentence of sentences) {
    const bare = modelMentions(sentence).filter((m) => m.full && BARE_MODEL.test(m.full));
    if (!bare.length) continue;
    const text = searchKey(sentence);
    if (/(?<!\p{L})(χωρισ|without)(?!\p{L})/u.test(text)) continue;
    const claim = BATTERY_CLAIM.exec(text);
    if (claim) problems.push(`Το ${bare[0].full} είναι σκέτο εργαλείο, αλλά η πρόταση γράφει «${claim[0].trim()}»: «${sentence.trim().slice(0, 140)}»`);
  }
  return gate("bareKit", problems);
}

// 5. AI tells ────────────────────────────────────────────────────────────────

/** The clichés of the writer's STYLE block, after `searchKey`. */
export const AI_TELLS = [
  "στον σημερινο κοσμο",
  "ας δουμε",
  "ας εξετασουμε",
  "συμπερασματικα",
  "εν κατακλειδι",
  "ειτε ειστε",
  "ανακαλυψτε",
  "απογειωστε",
  "κορυφαια ποιοτητα",
  "εξαιρετικη επιλογη",
  "ιδανικο για καθε αναγκη",
  "αξιοπιστοσ συντροφοσ",
  "χωρισ αμφιβολια",
  "αναμφιβολα",
  "μη διστασετε",
  "game changer",
  "επομενο επιπεδο",
  "κανει τη διαφορα",
  "στο τελοσ τησ ημερασ",
] as const;

/** Pictographs, not ©, ® or ™ (FUEL™ is a trademark, not an emoji). */
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u;

export function aiTellsGate(draft: Draft, alts: string[] = []): GateResult {
  const raw = readable(allText(draft, alts));
  const text = searchKey(raw);
  const problems: string[] = [];
  for (const phrase of AI_TELLS) {
    if (new RegExp(`${start}${searchKey(phrase).replace(/ /g, "\\s+")}${end}`, "u").test(text)) problems.push(`Κλισέ: «${phrase}»`);
  }
  const bangs = (visibleText(draft).match(/!(?!\[)/g) ?? []).length;
  if (bangs > 2) problems.push(`${bangs} θαυμαστικά (έως 2)`);
  const emoji = EMOJI.exec(raw);
  if (emoji) problems.push(`Emoji: ${emoji[0]}`);
  return gate("aiTells", problems);
}

// ── Keywords and entities are metadata, not claims ──────────────────────────

/** Why a keyword or entity may not stay: a price, stock, dealer, wholesale, brand or AI-tell word. */
export function metadataProblem(value: string): string | null {
  const text = searchKey(value);
  for (const [re, what] of [
    [PRICE, "τιμή"],
    [STOCK, "απόθεμα"],
    [DEALER_WORDING, "αντιπρόσωπος"],
    [WHOLESALE, "χονδρική"],
    [OTHER_BRANDS, "άλλη μάρκα"],
  ] as const) {
    if (re.test(text) || (re === DEALER_WORDING && re.test(value))) return what;
  }
  if (/(?<!\p{L})(φθην|προσφορ|εκπτωσ|αγορα\s+online|online\s+αγορα)/u.test(text)) return "εμπορικός όρος";
  if (AI_TELLS.some((p) => text.includes(searchKey(p))) || EMOJI.test(value)) return "κλισέ";
  return null;
}

export type Sanitized = { draft: Draft; dropped: Array<{ field: "keywords" | "entities"; value: string; why: string }> };

/** Drops the keywords and entities that would trip a gate, and says which. */
export function sanitizeMetadata(draft: Draft): Sanitized {
  const dropped: Sanitized["dropped"] = [];
  const keep = (field: "keywords" | "entities") =>
    draft[field].filter((value) => {
      const why = metadataProblem(value);
      if (why) dropped.push({ field, value, why });
      return !why;
    });
  return { draft: { ...draft, keywords: keep("keywords"), entities: keep("entities") }, dropped };
}

// 6. Links ───────────────────────────────────────────────────────────────────

/** Every Markdown link target of the text (not images). */
export function linkTargets(text: string): string[] {
  return [...text.matchAll(/(?<!!)\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g)].map((m) => m[1]);
}

const SCHEME = /(?<![\p{L}\d])(?:[a-z][a-z0-9+.-]*:\/\/|(?:mailto|tel|javascript|data|ftp|sms|whatsapp|viber):)/iu;
const WWW = /(?<![\p{L}\d])www\./iu;
const DOMAIN = /(?<![\p{L}\d@.-])[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:gr|com|eu|net|org|io|it|de|co|uk|info|biz|shop|store|app|online)(?![\p{L}\d])/iu;

export type LinkRules = {
  /** The paths the fact pack offers: every href must be one of them, exactly. */
  allowed: Set<string>;
  /** The catalogue photos the runner put in the body: their URLs are ours. */
  placedImages: string[];
  /** Internal paths that lead nowhere (`brokenLinks`, as /admin/seo checks them). */
  broken: string[];
};

export function linksGate(draft: Draft, rules: LinkRules, alts: string[] = []): GateResult {
  const problems: string[] = [];
  let raw = allText(draft, alts);
  for (const url of rules.placedImages) raw = raw.split(`](${url})`).join("]");
  for (const href of linkTargets(raw)) {
    if (!rules.allowed.has(href.trim())) problems.push(`Σύνδεσμος εκτός της λίστας του πακέτου: ${href}`);
  }
  for (const [re, what] of [
    [SCHEME, "Διεύθυνση με πρωτόκολλο"],
    [WWW, "Διεύθυνση www"],
    [DOMAIN, "Όνομα site"],
  ] as const) {
    const m = re.exec(raw);
    if (m) problems.push(`${what} στο κείμενο: «${raw.slice(m.index, m.index + 40).split(/\s/)[0]}»`);
  }
  for (const path of rules.broken) problems.push(`Σύνδεσμος σε σελίδα που δεν υπάρχει: ${path}`);
  return gate("links", problems);
}

// 7. Lengths ─────────────────────────────────────────────────────────────────

export const BODY_MIN_WORDS = 700;
export const BODY_MIN_H2 = 3;
export const FAQ_MIN = 4;
export const KEYWORDS_MIN = 4;

/** Words of a Markdown body as read: no link targets, images, table rules or markup. */
export function bodyWords(markdown: string): number {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, " ")
    .replace(/[#>*_|[\]`]/g, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function lengthsGate(draft: Draft): GateResult {
  const problems: string[] = [];
  const seoTitle = draft.seoTitle.trim();
  if (!draft.title.trim()) problems.push("Λείπει ο τίτλος");
  if (!seoTitle) problems.push("Λείπει ο τίτλος για τη Google");
  else if (seoTitle.length > TITLE_MAX) problems.push(`Τίτλος Google ${seoTitle.length} χαρακτήρες (έως ${TITLE_MAX})`);
  const meta = draft.metaDescription.trim();
  if (!meta) problems.push("Λείπει η περιγραφή για τη Google");
  else if (meta.length > DESCRIPTION_MAX) problems.push(`Περιγραφή ${meta.length} χαρακτήρες (έως ${DESCRIPTION_MAX})`);
  const answer = words(draft.answer);
  if (answer < ANSWER_WORDS.min || answer > ANSWER_WORDS.max) {
    problems.push(`Σύντομη απάντηση ${answer} λέξεις (${ANSWER_WORDS.min}–${ANSWER_WORDS.max})`);
  }
  const body = bodyWords(draft.body);
  if (body < BODY_MIN_WORDS) problems.push(`Κείμενο ${body} λέξεις (τουλάχιστον ${BODY_MIN_WORDS})`);
  const h2 = (draft.body.match(/^##\s+\S/gm) ?? []).length;
  if (h2 < BODY_MIN_H2) problems.push(`${h2} ενότητες H2 (τουλάχιστον ${BODY_MIN_H2})`);
  const faq = draft.faq.filter((p) => p.q.trim() && p.a.trim()).length;
  if (faq < FAQ_MIN) problems.push(`${faq} ερωτήσεις FAQ (τουλάχιστον ${FAQ_MIN})`);
  const keywords = draft.keywords.filter((k) => k.trim()).length;
  if (keywords < KEYWORDS_MIN) problems.push(`${keywords} λέξεις-κλειδιά (τουλάχιστον ${KEYWORDS_MIN})`);
  return gate("lengths", problems);
}

// 8. Language ────────────────────────────────────────────────────────────────

export const GREEK_SHARE_MIN = 0.85;

const nameKey = (token: string) => token.replace(/[™®]/g, "").toUpperCase();

/**
 * The words that are names, not language: every Latin token of the pack's
 * product names, models, codes and store facts, and of the catalogue's model
 * codes. What the WRITER declares as an entity does not count here.
 */
export function namesFrom(texts: Iterable<string>): Set<string> {
  const names = new Set<string>();
  for (const text of texts) {
    for (const token of text.split(/[\s/()«»"'.,;:!?·–—]+/)) if (/[A-Za-z]/.test(token)) names.add(nameKey(token));
  }
  return names;
}

/** The share of Greek among the letters, the known names aside. */
export function greekShare(text: string, names: Set<string> = new Set()): number {
  const t = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\]\([^)]*\)/g, "]");
  let greek = 0;
  let latin = 0;
  for (const token of t.split(/[\s/()«»"'.,;:!?·–—[\]*#|>_`]+/)) {
    if (!token || names.has(nameKey(token))) continue;
    for (const ch of token) {
      if (/\p{Script=Greek}/u.test(ch)) greek++;
      else if (/[A-Za-z]/.test(ch)) latin++;
    }
  }
  return greek + latin === 0 ? 0 : greek / (greek + latin);
}

export function languageGate(draft: Draft, names: Set<string>, alts: string[] = []): GateResult {
  const share = greekShare([visibleText(draft), ...alts].join("\n\n"), names);
  return gate(
    "language",
    share >= GREEK_SHARE_MIN ? [] : [`Ελληνικά ${Math.round(share * 100)}% των γραμμάτων (τουλάχιστον ${GREEK_SHARE_MIN * 100}%)`],
  );
}

// 9. Uniqueness ──────────────────────────────────────────────────────────────

export type Existing = { slug: string; title: string; mainKeyword: string | null };

export function uniqueGate(draft: Draft, slug: string, existing: Existing[]): GateResult {
  const problems: string[] = [];
  if (existing.some((e) => e.slug === slug)) problems.push(`Το slug «${slug}» υπάρχει ήδη`);
  const main = draft.keywords[0] ?? "";
  for (const e of existing) {
    const t = similarity(draft.title, e.title);
    if (t >= DUPLICATE_AT) problems.push(`Ο τίτλος μοιάζει με «${e.title}» (${t.toFixed(2)})`);
    if (main && e.mainKeyword) {
      const k = similarity(main, e.mainKeyword);
      if (k >= DUPLICATE_AT) problems.push(`Η κύρια λέξη «${main}» μοιάζει με «${e.mainKeyword}» του «${e.title}» (${k.toFixed(2)})`);
    }
  }
  return gate("unique", problems);
}

// 10. Verifier ───────────────────────────────────────────────────────────────

export type Unsupported = { claim: string; reason?: string };

export function verifierGate(unsupported: Unsupported[] | null): GateResult {
  if (unsupported == null) return gate("verifier", ["Ο έλεγχος ισχυρισμών δεν ολοκληρώθηκε"]);
  return gate(
    "verifier",
    unsupported.map((u) => `Χωρίς στήριξη: «${u.claim}»${u.reason ? ` (${u.reason})` : ""}`),
  );
}

// 11. Image ──────────────────────────────────────────────────────────────────

/** The hero as it is on our CDN: no uploaded hero, no publication. */
export function imageGate(heroImageUrl: string | null, problem?: string | null): GateResult {
  if (heroImageUrl) return gate("image", []);
  return gate("image", [problem ?? "Καμία φωτογραφία προϊόντος (no image)"]);
}

// ── All of them ─────────────────────────────────────────────────────────────

export type GateInput = {
  draft: Draft;
  /** The hero's alt and every inline image's alt. */
  alts: string[];
  slug: string;
  supported: Set<string>;
  catalogue: Catalogue;
  /** The fact pack as text: what it names verbatim counts as known (codes gate). */
  packText?: string;
  links: LinkRules;
  names: Set<string>;
  existing: Existing[];
  unsupported: Unsupported[] | null;
  heroImageUrl: string | null;
  imageProblem?: string | null;
};

/** Every gate but the image, which needs the upload that only a unique text gets. */
export function textGates(input: Omit<GateInput, "heroImageUrl" | "imageProblem">): GateResult[] {
  const { draft, alts } = input;
  return [
    numbersGate(draft, input.supported, alts),
    codesGate(draft, input.catalogue, alts, input.packText ?? ""),
    forbiddenGate(draft, alts),
    bareKitGate(draft, alts),
    aiTellsGate(draft, alts),
    linksGate(draft, input.links, alts),
    lengthsGate(draft),
    languageGate(draft, input.names, alts),
    uniqueGate(draft, input.slug, input.existing),
    verifierGate(input.unsupported),
  ];
}

export function runGates(input: GateInput): GateResult[] {
  return [...textGates(input), imageGate(input.heroImageUrl, input.imageProblem)];
}

export const failedGates = (results: GateResult[]): GateId[] => results.filter((r) => !r.ok).map((r) => r.id);
