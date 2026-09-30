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

const GREEK_ENDINGS = ["ουσ", "εισ", "ων", "ου", "οι", "οσ", "εσ", "ασ", "ησ", "α", "ο", "ι", "η", "ε", "υ", "ω"];

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

/** The units the number gate checks (spec §6.1), each with its spellings. */
const UNIT_PATTERNS: Array<[string, string]> = [
  ["rpm", "rpm|min-1|min⁻¹|min\\^-1|min−1|σ\\.?α\\.?λ\\.?|στροφές\\s+ανά\\s+λεπτό"],
  ["bpm", "bpm|ipm|κρούσεις\\s+ανά\\s+λεπτό"],
  ["ah", "Ah"],
  ["nm", "Nm"],
  ["mm", "mm"],
  ["kg", "kg"],
  ["v", "V|Volt|volt"],
  ["w", "W|Watt|watt"],
  ["j", "J|Joule|joule"],
  ["deg", "°"],
];

const NUM = "\\d{1,3}(?:[.,\\u00a0\\u202f ]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?";
const UNIT_ALT = UNIT_PATTERNS.map(([, p]) => `(?:${p})`).join("|");
/** A number, or a range of two, then a unit that is not the start of a longer word. */
const MENTION = new RegExp(
  `(?<![\\p{L}\\d.,])(${NUM})(?:\\s*(?:[-–—]|έως|ως|μέχρι)\\s*(${NUM}))?\\s?(${UNIT_ALT})(?![\\p{L}\\d])`,
  "gu",
);

function unitOf(raw: string): string | null {
  for (const [id, pattern] of UNIT_PATTERNS) {
    if (new RegExp(`^(?:${pattern})$`, "u").test(raw)) return id;
  }
  if (/^(rpm|min-1|min⁻¹|σ\.?α\.?λ\.?)$/i.test(raw)) return "rpm";
  return null;
}

/**
 * Every value a written number can mean. «33,000» and «2.100» are thousands
 * in the catalogue and decimals elsewhere, so both readings are kept; «5,0»
 * and «5.0» are 5; spaces inside a number are thousands.
 */
export function numberReadings(token: string): number[] {
  const t = token.replace(/[   ]/g, "").trim();
  const out = new Set<number>();
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(t)) out.add(Number(t.replace(/[.,]/g, "")));
  if (/^\d+(?:[.,]\d+)?$/.test(t)) out.add(Number(t.replace(",", ".")));
  if (/^\d{1,3}(?:[.,]\d{3})+[.,]\d+$/.test(t)) {
    // "1.234,5" / "1,234.5"
    const last = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
    out.add(Number(`${t.slice(0, last).replace(/[.,]/g, "")}.${t.slice(last + 1)}`));
  }
  return [...out].filter(Number.isFinite);
}

export type NumberMention = { text: string; unit: string; readings: number[][] };

/** Numbers with a unit in a text: «158 Nm», «0–2100 rpm», «5,0 Ah», «33 000 bpm». */
export function numberMentions(text: string): NumberMention[] {
  const out: NumberMention[] = [];
  for (const match of text.matchAll(MENTION)) {
    const unit = unitOf(match[3]);
    if (!unit) continue;
    const readings = [numberReadings(match[1]), ...(match[2] ? [numberReadings(match[2])] : [])].filter((r) => r.length);
    if (readings.length) out.push({ text: match[0].trim(), unit, readings });
  }
  return out;
}

/** «Μέγιστη ροπή (Nm)» → "nm"; the last parenthesis that is a unit. */
export function labelUnit(label: string): string | null {
  const parts = [...label.matchAll(/\(([^()]+)\)/g)].map((m) => m[1].trim()).reverse();
  for (const part of parts) {
    const unit = unitOf(part);
    if (unit) return unit;
  }
  return null;
}

/** Every number in a value, each with its readings: "0 – 2100" → [[0],[2100]]. */
export function valueNumbers(value: string): number[][] {
  return (value.match(new RegExp(`(?<![\\p{L}\\d.,])(?:${NUM})`, "gu")) ?? []).map(numberReadings).filter((r) => r.length);
}

const key = (unit: string, n: number) => `${unit}:${Math.round(n * 1000) / 1000}`;

/**
 * The set of «unit:value» the fact pack supports: numbers written with their
 * unit anywhere in it, and every number of a labelled row whose label names
 * the unit («Μέγιστη ροπή (Nm): 158»), or whose unit field does (official specs).
 */
export function supportedNumbers(
  texts: string[],
  rows: Array<{ label: string; value: string; unit?: string | null }>,
): Set<string> {
  const set = new Set<string>();
  for (const text of texts) {
    for (const m of numberMentions(text)) for (const r of m.readings) for (const n of r) set.add(key(m.unit, n));
  }
  for (const row of rows) {
    for (const m of numberMentions(row.value)) for (const r of m.readings) for (const n of r) set.add(key(m.unit, n));
    const unit = (row.unit ? unitOf(row.unit.trim()) : null) ?? labelUnit(row.label);
    if (!unit) continue;
    for (const r of valueNumbers(row.value)) for (const n of r) set.add(key(unit, n));
  }
  return set;
}

/** The mentions of `text` none of whose readings the pack supports. */
export function unsupportedNumbers(text: string, supported: Set<string>): string[] {
  return numberMentions(text)
    .filter((m) => !m.readings.every((r) => r.some((n) => supported.has(key(m.unit, n)))))
    .map((m) => m.text);
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
