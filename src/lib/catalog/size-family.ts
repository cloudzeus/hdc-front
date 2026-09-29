/**
 * Size families: which codes are the same product in another size.
 *
 * SoftOne gives every size its own MTRL, its own manufacturer code and its own
 * EAN: `ΓΑΝΤΙΑ HI-DEX LEVEL B 8/M 4932480492` and `… 9/L 4932480493` share
 * nothing but the name. HDCtool groups them (`variantGroup`) by removing the
 * ASSIGNED size label and the MPN from the name — so the human judgement of the
 * «Μεγέθη» buttons is what decides, never a guess from the name alone.
 *
 * Its rule only removes a label that stands on its own («No 36», «XL»). Gloves
 * are named `8/M`, `M/8`, `10 (XL)`, `XL-9`; clothing says `XXL` where the label
 * is `2XL`; and some names spell `Μ` or `Α` with the Greek letter. None of those
 * matched, so 200+ gloves and garments stayed one card per size — in the Kolleris
 * eshop too, which trusts `variantGroup` as it arrives.
 *
 * This module is the same rule with those spellings understood. It still never
 * groups a code without an assigned size, and the size must actually appear in
 * the name: a 12άρι key is another tool, not another size.
 *
 * Pure — no database — so it can be unit-tested and run inside the sync.
 */

/** Greek capitals that look like Latin ones. ERP names mix them freely. */
const LOOKALIKE: Record<string, string> = {
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M",
  Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
};

/** Same length as the input, so match positions carry back to the original. */
export function foldLookalikes(text: string): string {
  let out = "";
  for (const ch of text) out += LOOKALIKE[ch] ?? ch;
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `2XL` and `XXL` are one size written two ways; the ERP uses both. */
const ALIASES: Record<string, string[]> = {
  "2XL": ["XXL"],
  XXL: ["2XL"],
  "3XL": ["XXXL"],
  XXXL: ["3XL"],
  "4XL": ["XXXXL"],
  XXXXL: ["4XL"],
};

function spellings(labels: string[]): string[] {
  const all = new Set<string>();
  for (const raw of labels) {
    const label = foldLookalikes(raw.trim().toUpperCase());
    if (!label) continue;
    all.add(label);
    for (const alias of ALIASES[label] ?? []) all.add(alias);
  }
  // Longest first, so `XXL` is not read as `XL` followed by junk.
  return [...all].sort((a, b) => b.length - a.length);
}

/** Letter sizes a two-size label («L/XL», «4XL/5XL») may pair this code's with. */
const LETTER_SIZES = [
  "XXXXXL", "XXXXL", "XXXL", "XXL", "XXS", "5XL", "4XL", "3XL", "2XL", "XL", "XS", "S", "M", "L",
];

/**
 * The size as written in the name: `8/M`, `M/8`, `L/XL`, `No 36`, `10 (XL)`,
 * `XL-9`, `S/7-`, and in the translations `Size 9/L,` / `Taglia 9/L`. At least
 * one part has to be one of THIS code's labels — numbers alone are never a
 * size (they are torque, length, pack count); the other parts may be numbers
 * or letter sizes («L/XL» for a vest labelled just L).
 */
function tokenRegex(labels: string[]): RegExp | null {
  const words = spellings(labels);
  if (words.length === 0) return null;
  const label = `(?:${words.map(escapeRe).join("|")})`;
  const other = `(?:${LETTER_SIZES.join("|")}|\\d{1,2})`;
  const part = `(?:${label}|${other})`;
  const core = `(?:${other}[/-])*${label}(?:[/-]${part})*`;
  const prefix = `(?:(?:SIZE|TAGLIA|MISURA)\\s+)?(?:NO\\.?\\s*)?`;
  const token = `${prefix}${core}-?|(?:\\d{1,2}\\s*)?\\(${core}\\)`;
  return new RegExp(`(^|\\s)(${token})(?=[\\s,;]|$)`, "gi");
}

type TokenMatch = { start: number; end: number; text: string };

function findTokens(name: string, labels: string[]): TokenMatch[] {
  const re = tokenRegex(labels);
  if (!re) return [];
  const folded = foldLookalikes(name);
  const found: TokenMatch[] = [];
  for (const m of folded.matchAll(re)) {
    const start = (m.index ?? 0) + m[1].length;
    found.push({ start, end: start + m[2].length, text: m[2] });
  }
  return found;
}

/**
 * The name without its size — what a card that stands for the whole family, or
 * a product page with a size picker under the title, should say.
 *
 * Unchanged when no size is found, or when almost nothing would be left.
 */
export function stripSizeToken(name: string, labels: string[]): string {
  const tokens = findTokens(name, labels);
  if (tokens.length === 0) return name;
  let out = name;
  for (const t of [...tokens].reverse()) out = `${out.slice(0, t.start)} ${out.slice(t.end)}`;
  // «Gloves, Size 9/L, Pack of 12» → «Gloves, Pack of 12», not «Gloves, , Pack».
  const cleaned = out
    .replace(/\s+/g, " ")
    .replace(/\s+([,;])/g, "$1")
    .replace(/([,;])(\s*[,;])+/g, "$1")
    .replace(/^[\s,;]+|[\s,;]+$/g, "")
    .trim();
  return cleaned.length >= 3 ? cleaned : name;
}

/**
 * The label a size button shows: the size as the NAME writes it, which for
 * gloves carries both scales («8/M») and tells apart two codes the operator
 * labelled with the same letter. Falls back to the assigned label.
 */
export function sizeDisplayLabel(name: string, labels: string[]): string | null {
  const token = findTokens(name, labels)[0]?.text;
  if (token) {
    const clean = foldLookalikes(token)
      .toUpperCase()
      .replace(/^(?:SIZE|TAGLIA|MISURA)\s+/, "")
      .replace(/^NO\.?\s*/, "")
      .replace(/-$/, "")
      .replace(/^(\d{1,2})\s*\((.+)\)$/, "$1/$2")
      .replace(/^\((.+)\)$/, "$1")
      .trim();
    if (clean) return clean;
  }
  const first = labels.map((l) => l.trim()).find(Boolean);
  return first ? foldLookalikes(first.toUpperCase()) : null;
}

/**
 * The family key: the name without the MPN, without the size, without the
 * brand word (the shop sells one brand, and HDCtool's names carry it only
 * sometimes), in capitals with Greek lookalikes folded to Latin.
 *
 * Null when the code has no assigned size, or its size does not appear in its
 * name — the safety brake: nothing is grouped on a guess.
 */
export function sizeFamilyKey(input: {
  name: string | null | undefined;
  mpn?: string | null;
  sizeLabels: string[];
}): string | null {
  const name = (input.name ?? "").trim();
  if (!name || input.sizeLabels.length === 0) return null;
  if (findTokens(name, input.sizeLabels).length === 0) return null;

  let base = stripSizeToken(name, input.sizeLabels);
  base = foldLookalikes(base.toUpperCase());
  const mpn = input.mpn?.trim();
  if (mpn) {
    base = base.replace(
      new RegExp(`(^|\\s)${escapeRe(foldLookalikes(mpn.toUpperCase()))}(?=\\s|$)`, "g"),
      " ",
    );
  }
  base = base
    .replace(/(^|\s)MILWAUKEE(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, "")
    .trim();
  return base.length >= 3 ? base : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ordering
// ─────────────────────────────────────────────────────────────────────────────

const LETTER_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL", "XXXXXL"];

function letterRank(part: string): number | null {
  let p = part.toUpperCase();
  const n = /^(\d)XL$/.exec(p);
  if (n) p = `${"X".repeat(Number(n[1]))}L`;
  const i = LETTER_ORDER.indexOf(p);
  return i >= 0 ? i : null;
}

/**
 * S < M < L < XL < XXL, 36 < 37 < 48, 7/S < 8/M < 11/XXL, S/M < L/XL < 2XL/3XL.
 *
 * A label with a letter size in it sorts by the first one — so `S/7` and
 * `8/M` in the same family still come out S, M — then by its number (two codes
 * both labelled XL: `10/XL` before `11/XL`). Pure numbers (shoes) sort
 * numerically, anything unknown last and alphabetically.
 */
export function compareSizeLabels(a: string, b: string): number {
  const ka = sizeSortKey(a);
  const kb = sizeSortKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || a.localeCompare(b, "el");
}

function sizeSortKey(label: string): [number, number, number] {
  const text = foldLookalikes(label.trim().toUpperCase());
  const parts = text.split(/[/\-\s()]+/).filter(Boolean);
  const numeric = parts.find((p) => /^\d+(?:[.,]\d+)?$/.test(p));
  const n = numeric == null ? 0 : Number(numeric.replace(",", "."));
  for (const part of parts) {
    const rank = letterRank(part);
    if (rank != null) return [1, rank, n];
  }
  if (numeric != null) return [0, n, 0];
  return [2, 0, 0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Planning the families of the whole catalogue
// ─────────────────────────────────────────────────────────────────────────────

export type FamilyRow = {
  id: string;
  code: string;
  name: string;
  mpn: string | null;
  sizeLabels: string[];
  /** What `variantGroup` holds now — HDCtool's key, or this plan's last one. */
  current: string | null;
  priceNet: number | null;
};

export type FamilyPlan = {
  /** The `variantGroup` every row should have. */
  group: Map<string, string | null>;
  /** The code each family is listed under. */
  leads: Set<string>;
};

/**
 * A price spread over this ratio means the key joined different products (a
 * pair of gloves and a box of twelve) — HDCtool's own measured alarm.
 */
const MAX_PRICE_RATIO = 1.5;

/**
 * Families for the whole catalogue, from the rows alone.
 *
 * A row is joined to the others that share its current `variantGroup` (so a
 * grouping HDCtool made is never split) OR its size-family key (so the sizes
 * HDCtool missed join it). A family of one is no family: a picker with one
 * button looks broken. Rows without an assigned size never belong to one.
 *
 * The family keeps the name most of its rows already carry, so the key stays
 * put from one run to the next; a new family takes its size-family key.
 *
 * The lead — the one card the listings show — is the smallest size, then the
 * lowest code: stable, since neither changes with stock.
 */
export function planSizeFamilies(rows: FamilyRow[]): FamilyPlan {
  const keyOf = new Map<string, string | null>();
  const byKey = new Map<string, FamilyRow[]>();
  for (const row of rows) {
    const key = sizeFamilyKey({ name: row.name, mpn: row.mpn, sizeLabels: row.sizeLabels });
    keyOf.set(row.id, key);
    if (key) (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(row);
  }
  // Veto a key whose members are priced too far apart.
  for (const members of byKey.values()) {
    const prices = members.map((m) => m.priceNet).filter((p): p is number => p != null && p > 0);
    if (prices.length >= 2 && Math.max(...prices) / Math.min(...prices) > MAX_PRICE_RATIO) {
      for (const m of members) keyOf.set(m.id, null);
    }
  }

  // Union-find over rows, joined through shared nodes.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const sized = rows.filter((r) => r.sizeLabels.length > 0);
  const firstByNode = new Map<string, string>();
  for (const row of sized) {
    parent.set(row.id, row.id);
    const nodes = [
      row.current ? `c:${row.current}` : null,
      keyOf.get(row.id) ? `k:${keyOf.get(row.id)}` : null,
    ].filter((n): n is string => n != null);
    for (const node of nodes) {
      const first = firstByNode.get(node);
      if (first) union(row.id, first);
      else firstByNode.set(node, row.id);
    }
  }

  const components = new Map<string, FamilyRow[]>();
  for (const row of sized) {
    const root = find(row.id);
    (components.get(root) ?? components.set(root, []).get(root)!).push(row);
  }

  const group = new Map<string, string | null>();
  const leads = new Set<string>();
  for (const row of rows) group.set(row.id, null);

  for (const members of components.values()) {
    if (members.length < 2) continue;

    const votes = new Map<string, number>();
    for (const m of members) if (m.current) votes.set(m.current, (votes.get(m.current) ?? 0) + 1);
    const byVotes = [...votes].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const keys = members.map((m) => keyOf.get(m.id)).filter((k): k is string => !!k).sort();
    const name = byVotes[0]?.[0] ?? keys[0];
    if (!name) continue;

    for (const m of members) group.set(m.id, name);

    const label = (m: FamilyRow) => sizeDisplayLabel(m.name, m.sizeLabels) ?? "";
    const lead = [...members].sort(
      (a, b) => compareSizeLabels(label(a), label(b)) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
    )[0];
    leads.add(lead.id);
  }

  return { group, leads };
}

/**
 * One row per family, in the order given — for bands that pick products by
 * something other than the lead flag and must not show the same gloves twice.
 */
export function onePerFamily<T extends { variantGroup?: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.variantGroup) return true;
    if (seen.has(row.variantGroup)) return false;
    seen.add(row.variantGroup);
    return true;
  });
}
