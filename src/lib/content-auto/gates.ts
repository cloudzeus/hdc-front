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
 * The checks an automatic article must pass to be published (spec §6). All of
 * them, every time: one failure leaves the text a DRAFT and the email says
 * which one. Pure — the runner gathers what they need from the database.
 */

export type GateId =
  | "numbers"
  | "codes"
  | "forbidden"
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

/** Everything a reader sees, as one text. */
export function visibleText(d: Pick<Draft, "title" | "seoTitle" | "metaDescription" | "answer" | "body" | "faq">): string {
  return [d.title, d.seoTitle, d.metaDescription, d.answer, d.body, ...d.faq.flatMap((p) => [p.q, p.a])].join("\n\n");
}

/** The text without Markdown link targets and images: what is read, not where it points. */
function readable(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/`[^`]*`/g, " ");
}

const gate = (id: GateId, problems: string[]): GateResult => ({ id, ok: problems.length === 0, problems: [...new Set(problems)].slice(0, 20) });

// 1. Numbers ─────────────────────────────────────────────────────────────────

export function numbersGate(draft: Draft, supported: Set<string>): GateResult {
  const text = readable(visibleText(draft));
  return gate(
    "numbers",
    unsupportedNumbers(text, supported).map((m) => `«${m}» δεν υπάρχει στο πακέτο στοιχείων`),
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

export function codesGate(draft: Draft, catalogue: Catalogue): GateResult {
  const text = readable(visibleText(draft));
  const problems: string[] = [];
  for (const code of codeMentions(text)) {
    if (!catalogue.codes.has(code)) problems.push(`Ο κωδικός ${code} δεν υπάρχει στον κατάλογο`);
  }
  for (const m of modelMentions(text)) {
    if (m.full ? !catalogue.fullCodes.has(m.full) : !catalogue.roots.has(m.root)) {
      problems.push(`Το μοντέλο ${m.full ?? m.root} δεν υπάρχει στον κατάλογο`);
    }
  }
  return gate("codes", problems);
}

// 3. Forbidden ───────────────────────────────────────────────────────────────

/* `\b` and `\w` are ASCII-only even with the `u` flag: Greek words get explicit edges. */
const W = "\\p{L}";
const edge = (body: string) => new RegExp(`(?<![${W}])(?:${body})`, "iu");
const PRICE = edge(`€|ευρώ(?![${W}])|EUR(?![${W}])|τιμ(?:ή|ές|ής|ών)\\s+(?:από\\s+|μόνο\\s+|στα\\s+|:\\s*)?\\d|κοστίζ[${W}]*\\s+\\d|\\d+\\s?(?:ευρώ|€)`);
/** «μετρητής αποθέματος» is the fuel gauge of a battery, not stock. */
const STOCK = edge(
  `(?<!μετρητ[${W}]{0,3}\\s)απόθεμ[${W}]*|(?<!μετρητ[${W}]{0,3}\\s)αποθέματ[${W}]*|σε\\s+στοκ|in stock|\\d+\\s*(?:τεμ\\.|τεμάχι[${W}]*)|εξαντλ[${W}]*|τελευταί[${W}]*\\s+(?:τεμάχι[${W}]*|κομμάτι[${W}]*)|διαθέσιμ[${W}]*\\s+\\d+`,
);
const WHOLESALE = edge(`χονδρ[${W}]*|b2b(?![${W}])|εταιρικ[${W}]*\\s+πελάτ[${W}]*|μεταπωλητ[${W}]*|reseller`);
const OTHER_BRANDS =
  /\b(makita|dewalt|de\s?walt|bosch|hilti|metabo|festool|ryobi|einhell|stanley|black\s*(\+|&|and)\s*decker|hikoki|hitachi|fein|aeg|worx|parkside|ridgid|kress|mafell|dremel|skil|flex|knipex|wera|wiha|stihl|husqvarna)\b/iu;

export function forbiddenGate(draft: Draft): GateResult {
  const text = readable(visibleText(draft));
  const problems: string[] = [];
  const hit = (re: RegExp, what: string) => {
    const m = re.exec(text);
    if (m) problems.push(`${what}: «${m[0].trim()}»`);
  };
  hit(PRICE, "Τιμή");
  hit(STOCK, "Απόθεμα ή ποσότητα");
  hit(DEALER_WORDING, "Δήλωση αντιπροσώπου");
  hit(WHOLESALE, "Χονδρική / B2B");
  hit(OTHER_BRANDS, "Άλλη μάρκα");
  return gate("forbidden", problems);
}

// 4. Links ───────────────────────────────────────────────────────────────────

/** Every Markdown link target of the text (not images). */
export function linkTargets(text: string): string[] {
  return [...text.matchAll(/(?<!!)\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g)].map((m) => m[1]);
}

/** `broken`: the internal paths that lead nowhere (`brokenLinks`, as /admin/seo checks them). */
export function linksGate(draft: Draft, broken: string[]): GateResult {
  const problems: string[] = [];
  for (const href of linkTargets(visibleText(draft))) {
    if (!href.startsWith("/") || href.startsWith("//")) problems.push(`Εξωτερικός σύνδεσμος: ${href}`);
  }
  if (/(?<![(\w/])(https?:\/\/|www\.)\S+/i.test(readable(visibleText(draft)))) problems.push("Διεύθυνση άλλου site στο κείμενο");
  for (const path of broken) problems.push(`Σύνδεσμος σε σελίδα που δεν υπάρχει: ${path}`);
  return gate("links", problems);
}

// 5. Lengths ─────────────────────────────────────────────────────────────────

export const BODY_MIN_WORDS = 700;
export const BODY_MIN_H2 = 3;
export const FAQ_MIN = 4;

/** Words of a Markdown body as read: no link targets, images, table rules or markup. */
export function bodyWords(markdown: string): number {
  return readable(markdown)
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, " ")
    .replace(/[#>*_|[\]]/g, " ")
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
  return gate("lengths", problems);
}

// 6. Language ────────────────────────────────────────────────────────────────

export const GREEK_SHARE_MIN = 0.85;

/**
 * The share of Greek among the letters, codes and names aside: a token with a
 * digit, an all-capitals Latin token (FUEL, PACKOUT), a capitalised Latin
 * name (Milwaukee) and every entity the article declares are not counted.
 */
export function greekShare(text: string, names: string[] = []): number {
  let t = readable(text);
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    if (name.trim()) t = t.split(name).join(" ");
  }
  let greek = 0;
  let latin = 0;
  for (const token of t.split(/[\s/()«»"'.,;:!?·–—-]+/)) {
    if (!token || /\d/.test(token)) continue;
    if (/^[A-Z][A-Za-z]*$/.test(token)) continue;
    for (const ch of token) {
      if (/\p{Script=Greek}/u.test(ch)) greek++;
      else if (/[A-Za-z]/.test(ch)) latin++;
    }
  }
  return greek + latin === 0 ? 0 : greek / (greek + latin);
}

export function languageGate(draft: Draft): GateResult {
  const share = greekShare(visibleText(draft), draft.entities);
  return gate(
    "language",
    share >= GREEK_SHARE_MIN ? [] : [`Ελληνικά ${Math.round(share * 100)}% των γραμμάτων (τουλάχιστον ${GREEK_SHARE_MIN * 100}%)`],
  );
}

// 7. Uniqueness ──────────────────────────────────────────────────────────────

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

// 8. Verifier ────────────────────────────────────────────────────────────────

export type Unsupported = { claim: string; reason?: string };

export function verifierGate(unsupported: Unsupported[] | null): GateResult {
  if (unsupported == null) return gate("verifier", ["Ο έλεγχος ισχυρισμών δεν ολοκληρώθηκε"]);
  return gate(
    "verifier",
    unsupported.map((u) => `Χωρίς στήριξη: «${u.claim}»${u.reason ? ` (${u.reason})` : ""}`),
  );
}

// 9. Image ───────────────────────────────────────────────────────────────────

export function imageGate(heroSource: string | null): GateResult {
  return gate("image", heroSource ? [] : ["Καμία φωτογραφία προϊόντος (no image)"]);
}

// ── All of them ─────────────────────────────────────────────────────────────

export type GateInput = {
  draft: Draft;
  slug: string;
  supported: Set<string>;
  catalogue: Catalogue;
  broken: string[];
  existing: Existing[];
  unsupported: Unsupported[] | null;
  heroSource: string | null;
};

export function runGates(input: GateInput): GateResult[] {
  return [
    numbersGate(input.draft, input.supported),
    codesGate(input.draft, input.catalogue),
    forbiddenGate(input.draft),
    linksGate(input.draft, input.broken),
    lengthsGate(input.draft),
    languageGate(input.draft),
    uniqueGate(input.draft, input.slug, input.existing),
    verifierGate(input.unsupported),
    imageGate(input.heroSource),
  ];
}

export const failedGates = (results: GateResult[]): GateId[] => results.filter((r) => !r.ok).map((r) => r.id);
