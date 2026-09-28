import { searchKey } from "@/lib/greek";
import { normalizeModelText, parseModel } from "@/lib/milwaukee/model";

/**
 * How a search query is read (spec §8.6). Pure — shared by the header
 * dropdown, the results page and the tests.
 *
 * The stored `products.searchKey` is the ERP name through `searchKey` only, so
 * it keeps whatever the ERP typed: a Greek «Μ18», a glued «M18FPD3-502X». The
 * query is therefore not only normalised but EXPANDED — each word becomes a
 * short list of spellings, any one of which may match:
 *
 *   «Μ18»      → m18 | μ18        (Greek lookalike capitals, both ways)
 *   «m18fpd3»  → m18 + fpd3       (platform split from the model)
 *   «FPD-3»    → fpd-3 | fpd3 | fpd 3
 *   «fpd 3»    → fpd3 | …         (a short model word and its number rejoined)
 *
 * Words are ANDed in any order, as the results page already did: «κρουστικό
 * δραπανοκατσάβιδο» finds the names written the other way round.
 */

/** Lower-case Latin letters with a Greek capital twin, and back. */
const LATIN_TO_GREEK: Record<string, string> = {
  a: "α", b: "β", e: "ε", z: "ζ", h: "η", i: "ι", k: "κ", m: "μ", n: "ν", o: "ο", p: "ρ", t: "τ", y: "υ", x: "χ",
};
const GREEK_TO_LATIN: Record<string, string> = Object.fromEntries(
  Object.entries(LATIN_TO_GREEK).map(([latin, greek]) => [greek, latin]),
);

/**
 * The query as the catalogue spells model codes: upper-cased for the model
 * parser, Greek lookalikes inside tokens that carry a digit turned Latin,
 * the platform split from a glued model, and a split «M 18» rejoined — then
 * through `searchKey` (accents, case, final sigma).
 */
export function normalizeQuery(raw: string): string {
  const upper = raw.normalize("NFC").toUpperCase().replace(/\s+/g, " ").trim();
  const joined = upper.replace(/(^|\s)[MΜ] (12|18)(?=\s|$)/g, "$1M$2");
  return searchKey(normalizeModelText(joined));
}

/** A Latin model word followed by a short number: «fpd 3», «m 12». */
const MODEL_WORD = /^[a-z]{1,6}$/;
const SHORT_NUMBER = /^\d{1,2}$/;

/**
 * The query as a list of words, each a list of accepted spellings. An empty
 * list means nothing searchable was typed.
 */
export function queryTokens(raw: string): string[][] {
  const words = normalizeQuery(raw).split(" ").filter(Boolean);

  const merged: string[] = [];
  for (const word of words) {
    const prev = merged[merged.length - 1];
    if (prev && MODEL_WORD.test(prev) && SHORT_NUMBER.test(word)) {
      merged[merged.length - 1] = prev + word;
      continue;
    }
    merged.push(word);
  }

  return [...new Set(merged)].map(spellings);
}

function spellings(word: string): string[] {
  const out = new Set([word]);
  if (word.includes("-")) {
    out.add(word.replace(/-/g, ""));
    out.add(word.replace(/-/g, " "));
  }
  // A token with a digit is a model code: the ERP may have typed its letters
  // as Greek capitals («Μ18»), so the Greek spelling is accepted too.
  for (const spelling of [...out]) {
    if (!/\d/.test(spelling)) continue;
    const greek = spelling.replace(/[a-z]/g, (c) => LATIN_TO_GREEK[c] ?? c);
    if (greek !== spelling) out.add(greek);
  }
  return [...out];
}

/**
 * The Prisma `where` fragment for a query: every word must appear, in any
 * order, in any of its spellings. Returns null when nothing searchable was
 * typed. Plain object so this module stays free of the Prisma client.
 */
export function searchWhere(raw: string): { AND: Array<{ OR: Array<{ searchKey: { contains: string } }> }> } | null {
  const tokens = queryTokens(raw);
  if (tokens.length === 0) return null;
  return {
    AND: tokens.map((alts) => ({ OR: alts.map((alt) => ({ searchKey: { contains: alt } })) })),
  };
}

// ── Highlight ──────────────────────────────────────────────────────────────

/**
 * One character folded for comparison — lower case, no accent, final sigma
 * medial, Greek lookalikes Latin. Always one character in, one out, so offsets
 * in the folded text are offsets on screen.
 */
function foldChar(c: string): string {
  const lower = c.toLowerCase();
  const bare = lower.normalize("NFD")[0] ?? lower;
  const sigma = bare === "ς" ? "σ" : bare;
  const out = GREEK_TO_LATIN[sigma] ?? sigma;
  return out.length === 1 ? out : c;
}

function fold(text: string): string {
  let out = "";
  for (const c of text) out += foldChar(c);
  return out;
}

export type HighlightPart = { text: string; hit: boolean };

/**
 * `text` cut into matched and unmatched runs, for a `<mark>`. Every spelling
 * of every word is looked for; overlapping hits merge.
 */
export function highlightParts(text: string, tokens: string[][]): HighlightPart[] {
  const chars = [...text];
  const folded = fold(text);
  const foldedChars = [...folded];
  const hit = new Array<boolean>(chars.length).fill(false);

  for (const alts of tokens) {
    for (const alt of alts) {
      const needle = fold(alt);
      if (needle.length < 1) continue;
      const hay = foldedChars.join("");
      let from = 0;
      for (;;) {
        const at = hay.indexOf(needle, from);
        if (at < 0) break;
        // `at` is a UTF-16 offset; turn it into a code-point index.
        const start = [...hay.slice(0, at)].length;
        const len = [...needle].length;
        for (let i = start; i < start + len && i < hit.length; i++) hit[i] = true;
        from = at + needle.length;
      }
    }
  }

  const parts: HighlightPart[] = [];
  for (let i = 0; i < chars.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === hit[i]) last.text += chars[i];
    else parts.push({ text: chars[i], hit: hit[i] });
  }
  return parts;
}

// ── Grouping by model ──────────────────────────────────────────────────────

export type ModelVariantRow = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  modelRoot: string;
  platform: string | null;
  modelContent: string | null;
  image: string | null;
  priceNet: number | null;
  vatRate: number;
  inStock: boolean;
  qty: number;
  insertedAt: number;
};

export type ModelVariant = {
  id: string;
  slug: string;
  sku: string;
  content: "bare" | "kit";
  /** From the kit suffix, when unambiguous. */
  kit: { batteries: number; ah: number } | null;
  /** "502X" — shown for a kit whose suffix does not read as batteries. */
  suffix: string | null;
  priceNet: number | null;
  vatRate: number;
  inStock: boolean;
  qty: number;
};

export type ModelGroup = {
  root: string;
  /** "M18 FUEL", "M12", "MX FUEL" or null. */
  tag: string | null;
  /** The kit's picture when there is one — it shows the whole system. */
  image: string | null;
  /** Where the row goes: the bare tool, else the first variant. */
  slug: string;
  inStock: boolean;
  variants: ModelVariant[];
};

/** How the variants of one model are told apart on a chip. */
export function variantOf(row: ModelVariantRow): ModelVariant {
  const parsed = parseModel(row.name);
  const content: "bare" | "kit" =
    row.modelContent === "kit" || row.modelContent === "bare"
      ? row.modelContent
      : (parsed?.content ?? "bare");
  const suffix = parsed?.code.split("-").pop() ?? null;
  return {
    id: row.id,
    slug: row.slug,
    sku: row.sku,
    content,
    kit: content === "kit" ? (parsed?.kit ?? null) : null,
    suffix: content === "kit" && !parsed?.kit ? suffix : null,
    priceNet: row.priceNet,
    vatRate: row.vatRate,
    inStock: row.inStock,
    qty: row.qty,
  };
}

function tagOf(rows: ModelVariantRow[]): string | null {
  const platform = rows.find((r) => r.platform)?.platform ?? null;
  if (!platform) return null;
  if (platform === "MX") return "MX FUEL";
  const fuel = rows.some((r) => parseModel(r.name)?.fuel);
  return fuel ? `${platform} FUEL` : platform;
}

/** Every word of the query appears in the model code itself. */
export function rootMatches(root: string, tokens: string[][]): boolean {
  const key = fold(root.toLowerCase());
  const compact = key.replace(/[\s-]/g, "");
  return (
    tokens.length > 0 &&
    tokens.every((alts) =>
      alts.some((alt) => {
        const needle = fold(alt);
        return key.includes(needle) || compact.includes(needle.replace(/[\s-]/g, ""));
      }),
    )
  );
}

/**
 * Products grouped into one row per model, best first:
 *   1. the model code itself matches the query (not only the description)
 *   2. more variants — a model sold bare and in kits is a main line
 *   3. more of it in stock
 *   4. newer
 * Variants inside a row: bare tool first, then kits by price.
 */
export function groupByModel(rows: ModelVariantRow[], tokens: string[][]): ModelGroup[] {
  const byRoot = new Map<string, ModelVariantRow[]>();
  for (const row of rows) {
    const list = byRoot.get(row.modelRoot);
    if (list) list.push(row);
    else byRoot.set(row.modelRoot, [row]);
  }

  const scored = [...byRoot.entries()].map(([root, list]) => {
    const variants = list.map(variantOf).sort((a, b) => {
      if (a.content !== b.content) return a.content === "bare" ? -1 : 1;
      return (a.priceNet ?? Infinity) - (b.priceNet ?? Infinity);
    });
    // The cheapest kit's picture: it shows the whole system, as sold most.
    const imageOf = new Map(list.map((r) => [r.id, r.image]));
    const kit = variants.find((v) => v.content === "kit" && imageOf.get(v.id));
    const any = variants.find((v) => imageOf.get(v.id));
    const group: ModelGroup = {
      root,
      tag: tagOf(list),
      image: (kit ?? any) ? (imageOf.get((kit ?? any)!.id) ?? null) : null,
      slug: variants[0].slug,
      inStock: list.some((r) => r.inStock),
      variants,
    };
    return {
      group,
      match: rootMatches(root, tokens) ? 1 : 0,
      count: list.length,
      stock: list.filter((r) => r.inStock).length,
      newest: Math.max(...list.map((r) => r.insertedAt)),
    };
  });

  scored.sort(
    (a, b) =>
      b.match - a.match ||
      b.count - a.count ||
      b.stock - a.stock ||
      b.newest - a.newest ||
      a.group.root.localeCompare(b.group.root),
  );
  return scored.map((s) => s.group);
}

// ── Did you mean ───────────────────────────────────────────────────────────

/**
 * The part of a query worth comparing with model codes: the words that hold a
 * Latin letter or a digit, in catalogue spelling («fpd4» → "FPD4",
 * «κρουστικό m18fpd4» → "M18 FPD4"). Null when there is none.
 */
export function didYouMeanText(raw: string): string | null {
  const words = normalizeQuery(raw)
    .split(" ")
    .filter((w) => /[a-z0-9]/.test(w));
  return words.length ? words.join(" ").toUpperCase() : null;
}

export type SimilarRoot = { root: string; sim: number; count: number; inStock: boolean };

/**
 * The closest models, best first: similarity in steps of 0.1 (finer than that
 * is noise between «FPD3» and «FPDX»), then the bigger family, then stock.
 */
export function rankSimilarRoots(rows: SimilarRoot[], limit = 4, threshold = 0.2): string[] {
  return rows
    .filter((r) => r.sim >= threshold)
    .sort(
      (a, b) =>
        Math.round(b.sim * 10) - Math.round(a.sim * 10) ||
        b.count - a.count ||
        Number(b.inStock) - Number(a.inStock) ||
        b.sim - a.sim ||
        a.root.localeCompare(b.root),
    )
    .slice(0, limit)
    .map((r) => r.root);
}

// ── Recent searches (the browser keeps them; this only shapes the list) ───

export const RECENT_SEARCHES_KEY = "hdc:recent-searches";
export const RECENT_SEARCHES_MAX = 5;

/** `query` put first, duplicates (ignoring case and accents) dropped, capped. */
export function pushRecent(list: string[], query: string, max = RECENT_SEARCHES_MAX): string[] {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q) return list.slice(0, max);
  const key = searchKey(q);
  return [q, ...list.filter((item) => searchKey(item) !== key)].slice(0, max);
}
