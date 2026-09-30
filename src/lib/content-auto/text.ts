import { searchKey, slugify } from "@/lib/greek";
import { normalizeModelText } from "@/lib/milwaukee/model";

/**
 * Pure text helpers of the automatic writer: word sets and their overlap
 * (duplicates), the article slug, numbers with units (the number gate) and
 * model codes (the codes gate). No I/O.
 */

// ── Word sets and similarity ────────────────────────────────────────────────

/**
 * Words that say nothing about the subject. After `searchKey`: lower case, no
 * accents, final sigma folded. The template words of the planner's titles
 * («πώς διαλέγω», «εκδόσεις, σύγκριση») are here too, or every «Πώς διαλέγω
 * X Milwaukee» would look like every other.
 */
const STOPWORDS = new Set(
  (
    "και η ο οι το τα της του των τη την τον τις τους στο στα στη στην στον στις στους σε για με απο ως " +
    "να που πωσ πως ποιο ποια ποιοσ ποιον ποιεσ τι ειναι μια ενα ενασ αν ολα οσα κατα μετα προσ " +
    "milwaukee οδηγοσ οδηγοι επιλογησ επιλογη νεο νεα νεοσ εκδοσεισ εκδοση συγκριση διαλεγω διαλεγετε " +
    "διαλεξετε αγορασω αγορα αγορασ σωστο σωστη καλυτερο καλυτερη guide vs the and for"
  ).split(/\s+/),
);

/** Longest first: «σφυριά» and «σφυρί» are both «σφυρ». */
const GREEK_ENDINGS = ["ιουσ", "ιων", "ιου", "ιεσ", "ιασ", "ια", "ιο", "ουσ", "εισ", "ων", "ου", "οι", "οσ", "εσ", "ασ", "ησ", "α", "ο", "ι", "η", "ε", "υ", "ω"];

/** A light stem, so «δράπανο» and «δράπανα» are one word. Greek words over 4 letters only. */
function stem(word: string): string {
  if (word.length <= 4 || !/[α-ω]/.test(word)) return word;
  for (const ending of GREEK_ENDINGS) {
    if (word.endsWith(ending) && word.length - ending.length >= 3) return word.slice(0, -ending.length);
  }
  return word;
}

export function wordSet(text: string | null | undefined): Set<string> {
  const words = searchKey(text ?? "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w));
  return new Set(words.map(stem));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / (a.size + b.size - common);
}

/** Jaccard over the meaningful words of two phrases (spec §3: duplicate at ≥ 0.6). */
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  return jaccard(wordSet(a), wordSet(b));
}

export const DUPLICATE_AT = 0.6;

// ── Slug ────────────────────────────────────────────────────────────────────

const SLUG_MAX = 80;

/**
 * The slug of an automatic article: the same transliteration as every other
 * slug of the shop (`slugify`, src/lib/greek.ts — «σύγκριση» → «sygkrisi»),
 * cut at a word boundary to 80 characters.
 */
export function articleSlug(title: string): string {
  const full = slugify(title);
  if (full.length <= SLUG_MAX) return full;
  const cut = full.slice(0, SLUG_MAX + 1);
  const at = cut.lastIndexOf("-");
  return (at > 20 ? cut.slice(0, at) : full.slice(0, SLUG_MAX)).replace(/-+$/, "");
}

// ── Numbers with units ──────────────────────────────────────────────────────

/**
 * The units the number gate checks (spec §6.1 and the review), each with its
 * spellings. Matched case-insensitively, longest first, on a text whose Greek
 * look-alike letters next to a digit («158 Νm» with a Greek Ν) are Latin again.
 */
const UNIT_PATTERNS: Array<[string, string]> = [
  ["rpm", "rpm|min-1|min⁻¹|min\\^-1|min−1|σ\\.?α\\.?λ\\.?|στροφές\\s+ανά\\s+λεπτό"],
  ["bpm", "bpm|ipm|spm|opm|κρούσεις\\s+ανά\\s+λεπτό"],
  ["ms2", "m/s²|m/s2|m/s\\^2"],
  ["degc", "°\\s?C|βαθμούς\\s+κελσίου"],
  ["kw", "kW"],
  ["wh", "Wh"],
  ["ah", "Ah"],
  ["nm", "Nm"],
  ["db", "dB\\s?\\(A\\)|dB"],
  ["mm", "mm|χιλιοστά"],
  ["cm", "cm|εκατοστά"],
  ["kg", "kg|κιλά|κιλό|κιλών"],
  ["inch", "ίντσες|ίντσα|ιντσών|inch|in\\.|\"|″|''"],
  ["m", "m|μέτρα|μέτρων"],
  ["v", "V|Volt"],
  ["w", "W|Watt"],
  ["j", "J|Joule"],
  ["pct", "%|τοις\\s+εκατό"],
  ["deg", "°|μοίρες"],
];

const NUM = "\\d{1,3}(?:[.,\\u00a0\\u202f ]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?";
const UNIT_ALT = UNIT_PATTERNS.map(([, p]) => `(?:${p})`).join("|");
/** A number, or a range of two, then a unit that is not the start of a longer word. */
const MENTION = new RegExp(
  `(?<![\\p{L}\\d.,/])(${NUM})(?:\\s*(?:[-–—]|έως|ως|μέχρι)\\s*(${NUM}))?\\s?(${UNIT_ALT})(?![\\p{L}\\d])`,
  "giu",
);
/** «1/2"», «½″», «3/8 ίντσας». */
const INCH_FRACTION = /(?<![\p{L}\d.,/])(\d{1,2}\/\d{1,2}|[½¼¾⅛⅜⅝⅞])\s?(?:"|″|''|ίντσ\p{L}*|inch\p{L}*)/giu;
const VULGAR: Record<string, string> = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };

/** Number words that sometimes stand before a unit («δύο Ah» never should). After `searchKey`. */
const NUMBER_WORDS: Record<string, number> = {
  δυο: 2, τρια: 3, τρεισ: 3, τεσσερα: 4, τεσσερισ: 4, πεντε: 5, εξι: 6, επτα: 7, εφτα: 7, οκτω: 8, οχτω: 8,
  εννεα: 9, εννια: 9, δεκα: 10, εντεκα: 11, δωδεκα: 12, δεκαοκτω: 18, δεκαοχτω: 18, εικοσι: 20, εκατο: 100, χιλια: 1000,
};
/** Words that make a bare number a claim whatever its size: «5 ετών», «3 χρόνια». */
const TIME_WORDS = /^\s?(ετ[ώη]ν|έτη|χρόν\p{L}*|μήν\p{L}*|ημέρ\p{L}*|ώρ\p{L}*|λεπτ\p{L}*|years?|months?)(?!\p{L})/iu;

function unitOf(raw: string): string | null {
  const clean = raw.trim();
  for (const [id, pattern] of UNIT_PATTERNS) {
    if (new RegExp(`^(?:${pattern})$`, "iu").test(clean)) return id;
  }
  return null;
}

/**
 * Text ready for number matching: Greek capitals that look Latin, right after
 * a number («158 Νm», «5,0 Αh»), become Latin; «2x12,0Ah», «2 × 5,0 Ah» and
 * «Ø 13 mm» get a space so the number stands on its own.
 */
export function numberText(text: string): string {
  const LOOK: Record<string, string> = { Α: "A", Β: "B", Ε: "E", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Χ: "X", κ: "k" };
  return text
    .replace(/(\d\s?)([ΑΒΕΗΙΚΜΝΟΡΤΧκ])(?=[A-Za-zΑΒΕΗΙΚΜΝΟΡΤΧκ]*(?![\p{L}]))/gu, (_m, n: string, c: string) => `${n}${LOOK[c] ?? c}`)
    .replace(/(\d)\s?[x×]\s?(?=\d)/gi, "$1 × ")
    .replace(/[ØøⲐ⌀]\s?(?=\d)/g, "⌀ ");
}

/**
 * Every value a written number can mean. In the article «33,000» and «2.100»
 * may be thousands or decimals, so both readings are kept; «5,0» and «5.0»
 * are 5; spaces inside a number are thousands. `strict` (the pack's side):
 * a separator followed by exactly three digits is a thousands separator only,
 * so a pack's «0-33.000 bpm» never supports an article's «33 bpm».
 */
export function numberReadings(token: string, strict = false): number[] {
  const t = token.replace(/[   ]/g, "").trim();
  const out = new Set<number>();
  const thousands = /^\d{1,3}(?:[.,]\d{3})+$/.test(t);
  if (thousands) out.add(Number(t.replace(/[.,]/g, "")));
  if (/^\d+(?:[.,]\d+)?$/.test(t) && !(strict && thousands)) out.add(Number(t.replace(",", ".")));
  if (/^\d{1,3}(?:[.,]\d{3})+[.,]\d+$/.test(t)) {
    // "1.234,5" / "1,234.5"
    const last = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
    out.add(Number(`${t.slice(0, last).replace(/[.,]/g, "")}.${t.slice(last + 1)}`));
  }
  return [...out].filter(Number.isFinite);
}

export type NumberMention = { text: string; unit: string; readings: number[][] };

/** Numbers with a unit in a text: «158 Nm», «0–2100 rpm», «5,0 Ah», «33 000 bpm», «1/2"», «δύο Ah». */
export function numberMentions(raw: string, strict = false): NumberMention[] {
  const text = numberText(raw);
  const out: NumberMention[] = [];
  for (const match of text.matchAll(MENTION)) {
    const unit = unitOf(match[3]);
    if (!unit) continue;
    const readings = [numberReadings(match[1], strict), ...(match[2] ? [numberReadings(match[2], strict)] : [])].filter((r) => r.length);
    if (readings.length) out.push({ text: match[0].trim(), unit, readings });
  }
  for (const match of text.matchAll(INCH_FRACTION)) {
    const [a, b] = (VULGAR[match[1]] ?? match[1]).split("/").map(Number);
    if (b) out.push({ text: match[0].trim(), unit: "inch", readings: [[a / b]] });
  }
  // «δύο Ah», «δεκαοκτώ V»: a number written as a word is still a number.
  const folded = searchKey(text);
  const words = Object.keys(NUMBER_WORDS).join("|");
  for (const match of folded.matchAll(new RegExp(`(?<![\\p{L}])(${words})\\s+(\\S+)`, "gu"))) {
    const unit = unitOf(match[2].replace(/[.,;:!?)]+$/, ""));
    if (unit && unit !== "inch") out.push({ text: match[0], unit, readings: [[NUMBER_WORDS[match[1]]]] });
  }
  return out;
}

/** «Μέγιστη ροπή (Nm)» → "nm"; the last parenthesis that is a unit. */
export function labelUnit(label: string): string | null {
  // One level of nesting: «Στάθμη θορύβου (dB(A))».
  const parts = [...label.matchAll(/\(((?:[^()]|\([^()]*\))+)\)/g)].map((m) => m[1].trim()).reverse();
  for (const part of parts) {
    const unit = unitOf(part);
    if (unit) return unit;
  }
  return null;
}

/** Every number in a value, each with its readings: "0 – 2100" → [[0],[2100]]. */
export function valueNumbers(value: string, strict = false): number[][] {
  return (numberText(value).match(new RegExp(`(?<![\\p{L}\\d.,])(?:${NUM})`, "gu")) ?? [])
    .map((t) => numberReadings(t, strict))
    .filter((r) => r.length);
}

const key = (unit: string, n: number) => `${unit}:${Math.round(n * 1000) / 1000}`;
const bareKey = (n: number) => `n:${Math.round(n * 1000) / 1000}`;
/** A duration («5 ετών») is supported only by the same duration in the pack, not by any 5. */
const timeKey = (n: number) => `t:${Math.round(n * 1000) / 1000}`;

/**
 * The set of «unit:value» the fact pack supports: numbers written with their
 * unit anywhere in it, and every number of a labelled row whose label names
 * the unit («Μέγιστη ροπή (Nm): 158»), or whose unit field does (official
 * specs). Every number of the pack is also there without a unit («n:…»), for
 * the bare numbers of the article. The pack is read strictly: «33.000» is
 * thirty-three thousand.
 */
export function supportedNumbers(
  texts: string[],
  rows: Array<{ label: string; value: string; unit?: string | null }>,
): Set<string> {
  const set = new Set<string>();
  const addBare = (s: string) => {
    for (const r of valueNumbers(s, true)) for (const n of r) set.add(bareKey(n));
    for (const b of bareNumbers(s)) if (b.time) for (const n of b.readings) set.add(timeKey(n));
  };
  for (const text of texts) {
    for (const m of numberMentions(text, true)) for (const r of m.readings) for (const n of r) set.add(key(m.unit, n));
    addBare(text);
  }
  for (const row of rows) {
    for (const m of numberMentions(row.value, true)) for (const r of m.readings) for (const n of r) set.add(key(m.unit, n));
    addBare(row.value);
    const unit = (row.unit ? unitOf(row.unit) : null) ?? labelUnit(row.label);
    if (unit) for (const r of valueNumbers(row.value, true)) for (const n of r) set.add(key(unit, n));
    // «1/2"» as a value of a labelled row («Υποδοχή: 1/2"») is read above as a mention.
  }
  return set;
}

/**
 * Numbers without a unit that still claim something: ten or more («30 φορές»,
 * «2100 στροφές»), or any number before a time word («εγγύηση 5 ετών»).
 * Not a model or a code: a number glued to letters (M18, FPD3, -502X) or part
 * of a mention with a unit is skipped, and 8+ digits are the codes gate's.
 */
export function bareNumbers(raw: string): Array<{ text: string; readings: number[]; time: boolean }> {
  const text = numberText(raw);
  const withUnit = new Set<number>();
  for (const m of text.matchAll(MENTION)) {
    withUnit.add(m.index!);
    if (m[2]) withUnit.add(m.index! + m[0].indexOf(m[2], m[1].length));
  }
  for (const m of text.matchAll(INCH_FRACTION)) withUnit.add(m.index!);
  const out: Array<{ text: string; readings: number[]; time: boolean }> = [];
  for (const m of text.matchAll(new RegExp(`(?<![\\p{L}\\d.,/\\-])(${NUM})(?![\\p{L}\\d/]|[.,]\\d|-[\\p{L}\\d])`, "gu"))) {
    if (withUnit.has(m.index!)) continue;
    const token = m[1];
    if (/^\d{8,}$/.test(token.replace(/\D/g, ""))) continue;
    const readings = numberReadings(token);
    const after = text.slice(m.index! + token.length, m.index! + token.length + 16);
    const time = TIME_WORDS.test(after);
    if (readings.some((n) => n >= 10) || time) out.push({ text: `${token}${time ? after.match(TIME_WORDS)![0] : ""}`.trim(), readings, time });
  }
  return out;
}

/** The mentions of `text` none of whose readings the pack supports, with and without a unit. */
export function unsupportedNumbers(text: string, supported: Set<string>): string[] {
  const withUnit = numberMentions(text)
    .filter((m) => !m.readings.every((r) => r.some((n) => supported.has(key(m.unit, n)))))
    .map((m) => m.text);
  const bare = bareNumbers(text)
    .filter((b) => !b.readings.some((n) => supported.has(b.time ? timeKey(n) : bareKey(n))))
    .map((b) => b.text);
  return [...withUnit, ...bare];
}

// ── Codes and models ────────────────────────────────────────────────────────

/** Platform words that follow «M18» without being a model: «M18 FUEL», «M12 REDLITHIUM». */
const NOT_A_MODEL = new Set(["FUEL", "REDLITHIUM", "HIGH", "FORGE", "ONE", "ONE-KEY", "PACKOUT", "SYSTEM", "BRUSHLESS", "PLATFORM", "BATTERY", "BATTERIES", "TM"]);

const MODEL_MENTION = /\b(M12|M18|MXF)\s([A-Z][A-Z0-9]*)(?:-([A-Z0-9]{1,4}))?(?![A-Z0-9])/g;

export type ModelMention = { root: string; full: string | null };

/** «M18 FPD3», «M18 FPD3-502X» in any text — Greek lookalike letters and «M18FPD3» included. */
export function modelMentions(text: string): ModelMention[] {
  const upper = normalizeModelText(text.toUpperCase().replace(/[™®]/g, ""));
  const out: ModelMention[] = [];
  for (const m of upper.matchAll(MODEL_MENTION)) {
    if (NOT_A_MODEL.has(m[2])) continue;
    const root = `${m[1]} ${m[2]}`;
    out.push({ root, full: m[3] ? `${root}-${m[3]}` : null });
  }
  return out;
}

/** Article numbers and EANs: 8 to 13 digits standing alone. */
export function codeMentions(text: string): string[] {
  return [...new Set(text.match(/(?<![\d.,])\d{8,13}(?![\d.,]?\d)/g) ?? [])];
}
