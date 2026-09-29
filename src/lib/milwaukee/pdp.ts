import { displayName } from "./display";
import { normalizeModelText, parseModel, type Platform } from "./model";
import { kitFromTechBlock, type TechRow } from "./tech-block";

/**
 * What the HDC product page reads out of a Milwaukee product (mockup pdp.html).
 *
 * Everything technical comes from the manufacturer's «Τεχνικά χαρακτηριστικά»
 * block (`parseTechBlock`), never from the AI-filled spec table — see
 * tech-block.ts for why. Pure functions: no Prisma, no translations, so the
 * page decides the words and these decide the facts.
 */

type Locale = "el" | "en" | "it";

// ── Numbers ────────────────────────────────────────────────────────────────

/**
 * One number as the source writes it. "33,000" and "2.100" are thousands
 * (a separator followed by exactly three digits); "2.2" and "5,0" are decimals.
 */
export function parseSpecNumber(token: string): number | null {
  if (!/^\d+(?:[.,]\d+)*$/.test(token)) return null;
  const n = /^\d{1,3}(?:[.,]\d{3})+$/.test(token)
    ? Number(token.replace(/[.,]/g, ""))
    : Number(token.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Every number in a value: "0 – 2100" → [0, 2100]; "0-33,000" → [0, 33000]. */
export function numbersIn(value: string): number[] {
  return (value.match(/\d+(?:[.,]\d+)*/g) ?? [])
    .map(parseSpecNumber)
    .filter((n): n is number => n != null);
}

export function formatSpecNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
}

/** "5.0" — Milwaukee writes capacities with one decimal in every language. */
export const ahLabel = (ah: number) => ah.toFixed(1);

// ── Title ──────────────────────────────────────────────────────────────────

/**
 * The H1: the clean name with the model ROOT instead of the full code, and no
 * FUEL (the platform tag above the title says it).
 *
 * "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ  M18FPD3-502X FUEL 4933479860"
 *   → "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3"
 *
 * The bare tool and every kit of it share this title; which one the page is
 * about is said by the variant selector and the codes line under it.
 */
export function pdpTitle(name: string, code?: string | null): string {
  const clean = displayName(name, code);
  const model = parseModel(clean);
  if (!model) return clean;
  const text = normalizeModelText(clean)
    .replace(model.code, model.root)
    .replace(/(^|\s)FUEL(™)?(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || clean;
}

/** "M18 FUEL" → "M18 FUEL™", as the mockup's tags print it. */
export const withTrademark = (tag: string) => tag.replace(/FUEL$/, "FUEL™");

// ── Description ────────────────────────────────────────────────────────────

/** Where the spec block starts, in each language the source writes. */
const TECH_HEADING =
  /^\s*[-–]?\s*(Τεχνικά χαρακτηριστικά|Technical specifications|Technical specs|Specifications|Specifiche tecniche|Caratteristiche tecniche|Dati tecnici)\s*:?\s*$/im;

/**
 * The prose of a long description: everything before the spec block, one
 * entry per paragraph (paragraphs are separated by a blank line).
 */
export function descriptionParagraphs(text: string | null | undefined): string[] {
  if (!text) return [];
  const at = text.search(TECH_HEADING);
  const prose = at === -1 ? text : text.slice(0, at);
  return prose
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

// ── Key numbers ────────────────────────────────────────────────────────────

export type KeyNumber = {
  key: "torque" | "speed" | "impact" | "energy" | "chuck" | "drive";
  /** Formatted for the locale: "2.100". A drive is its own text: "1/2″". */
  value: string;
  /** Upper-case unit for the caption: "NM", "RPM", "BPM", "MM", "J". */
  unit: string;
};

/** The last parenthesis of a label: "Μέγιστη ροπή (Nm)" → "Nm". */
const labelUnit = (label: string) => /\(([^()]+)\)\s*$/.exec(label)?.[1]?.trim() ?? null;

const RPM_UNITS = /^(rpm|σ\.?α\.?λ\.?|στροφές ανά λεπτό|min-1|min⁻¹|\/min)$/i;

const maxOf = (rows: TechRow[]) => {
  const all = rows.flatMap((r) => numbersIn(r.value)).filter((n) => n > 0);
  return all.length ? Math.max(...all) : null;
};

/**
 * The four numbers that decide the purchase (pdp.html `.keys`): torque, top
 * speed, blows per minute, chuck — each only when the manufacturer's block
 * states it. Labels vary («Μέγιστη ροπή», «Μεγίστη ροπή στρέψης», «Χωρίς φορτίο
 * ταχύτητα (σ.α.λ.)»), so they are matched by pattern; speeds and rates that
 * come as ranges or per gear give their maximum.
 */
export function keyNumbers(rows: TechRow[], locale: Locale = "el"): KeyNumber[] {
  const out: KeyNumber[] = [];
  const fmt = (n: number) => formatSpecNumber(n, locale);

  const torqueRow = rows.find((r) => /ροπ[ήη]/i.test(r.label) && numbersIn(r.value).some((n) => n > 0));
  const torque = torqueRow ? maxOf([torqueRow]) : null;
  if (torque != null) out.push({ key: "torque", value: fmt(torque), unit: "NM" });

  const speedRows = rows.filter((r) => {
    if (!/χωρίς φορτίο/i.test(r.label)) return false;
    const unit = labelUnit(r.label);
    return unit == null || RPM_UNITS.test(unit);
  });
  const speed = maxOf(speedRows);
  if (speed != null) out.push({ key: "speed", value: fmt(speed), unit: "RPM" });

  const impactRows = rows.filter((r) => /κρο[υύ]σ/i.test(r.label) && !/ενέργεια/i.test(r.label));
  const impact = maxOf(impactRows);
  if (impact != null) {
    const unit = impactRows.map((r) => labelUnit(r.label)).find((u) => u && /^(bpm|ipm)$/i.test(u));
    out.push({ key: "impact", value: fmt(impact), unit: (unit ?? "bpm").toUpperCase() });
  } else {
    const energy = maxOf(rows.filter((r) => /ενέργεια/i.test(r.label) && /κρο[υύ]σ/i.test(r.label)));
    if (energy != null) out.push({ key: "energy", value: fmt(energy), unit: "J" });
  }

  const chuckRow = rows.find((r) => /τσοκ/i.test(r.label));
  const chuck = chuckRow ? maxOf([chuckRow]) : null;
  if (chuck != null) {
    out.push({ key: "chuck", value: fmt(chuck), unit: "MM" });
  } else {
    const drive = rows.find((r) => /^υποδοχ/i.test(r.label) && r.value.length <= 14);
    if (drive) out.push({ key: "drive", value: drive.value, unit: "" });
  }

  return out.slice(0, 4);
}

// ── Spec table ─────────────────────────────────────────────────────────────

const UNIT =
  /^(mm|cm|m|Nm|rpm|bpm|ipm|spm|opm|V|Ah|Wh|kg|g|J|W|kW|mm²|l|L|ml|m\/s|m\/min|km\/h|dB\(A\)|dB|lm|Lumens|lux|h|min|°|bar|psi|Hz|A|σ\.α\.λ\.)$/;

/** Numbers as the page's language writes them; ranges get a spaced en dash. */
export function formatSpecValue(value: string, locale: Locale): string {
  return value
    .replace(/(?<![\p{L}\d.,/])\d+(?:[.,]\d+)*(?![\p{L}\d/])/gu, (token) => {
      // Long digit runs are part or article numbers, not quantities.
      if (/^\d{7,}$/.test(token)) return token;
      const n = parseSpecNumber(token);
      if (n == null) return token;
      // A decimal keeps its places: Milwaukee's "5.0" Ah is not "5".
      const decimals = /^\d+[.,](\d{1,2})$/.exec(token)?.[1].length ?? 0;
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: Math.max(decimals, 2),
      }).format(n);
    })
    .replace(/(\d)\s*[-–]\s*(?=\d)/g, "$1 – ");
}

/**
 * The spec table rows (pdp.html `.specs`): the code rows dropped (the codes
 * line above says them), the unit moved from the label to the value —
 * "Μέγιστη ροπή (Nm): 158" reads "Μέγιστη ροπή · 158 Nm".
 */
export function specTable(rows: TechRow[], locale: Locale = "el"): TechRow[] {
  return rows
    .filter((r) => !/^(Κωδικός|EAN|Manufacturer code|Product code|Code\b)/i.test(r.label))
    .map((r) => {
      const unit = labelUnit(r.label);
      let value = formatSpecValue(r.value, locale);
      if (!unit || !UNIT.test(unit)) return { label: r.label, value };
      const label = r.label.replace(/\s*\([^()]+\)\s*$/, "");
      const tail = /\s*(\([^()]*\))$/.exec(value);
      value = tail
        ? `${value.slice(0, tail.index)} ${unit} ${tail[1]}`
        : `${value} ${unit}`;
      return { label, value };
    });
}

// ── What is in the box ─────────────────────────────────────────────────────

export type BoxFacts = {
  batteries: { count: number; ah: number } | null;
  /** The charger's model, "M12–M18 FC", or "" when included but unnamed. */
  charger: string | null;
  /** «Παραδίδεται σε»: "HD Box". */
  case: string | null;
  /** «Βασικός εξοπλισμός», one entry per item. */
  accessories: string[];
};

const NEGATIVE = /^(δεν|όχι|οχι|χωρίς|no\b|none|-)/i;

/** "Μ12 – Μ18 FC Ταχφορτιστής" → "M12–M18 FC" (the Latin model words only). */
export function chargerModel(value: string): string {
  return normalizeModelText(value)
    .split(/\s+/)
    .filter((token) => /^[A-Z0-9][A-Z0-9.\-/]*$|^[–-]$/.test(token))
    .join(" ")
    .replace(/\s*[–-]\s*/g, "–")
    .replace(/^–|–$/g, "")
    .trim();
}

/** «Παραδίδεται σε» / "Supplied in", "Delivered in". */
const CASE_LABEL = /^((Παραδίδεται|Παρέχεται)(\s+σε)?|(Supplied|Delivered) in)$/i;
/** «Βασικός εξοπλισμός» / "Standard equipment", "Basic equipment". */
const ACCESSORIES_LABEL = /^((Βασικός|Στάνταρ) εξοπλισμός|(Standard|Basic) equipment)/i;

const splitItems = (value: string) =>
  value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

export function boxFacts(rows: TechRow[]): BoxFacts {
  const find = (label: RegExp) => rows.find((r) => label.test(r.label))?.value.trim();

  const kit = kitFromTechBlock(rows);
  const charger = find(/φορτιστ/i);
  const caseValue = find(CASE_LABEL);
  const accessories = find(ACCESSORIES_LABEL);

  return {
    batteries: kit ? { count: kit.batteries, ah: kit.ah } : null,
    charger: charger && !NEGATIVE.test(charger) ? chargerModel(charger) : null,
    case: caseValue && !NEGATIVE.test(caseValue) ? caseValue : null,
    accessories: accessories ? splitItems(accessories) : [],
  };
}

/**
 * The box facts in the page's language.
 *
 * The counts and the charger model stay as read from the Greek block (the
 * charger model is Latin anyway); the case and the accessory list are words,
 * so they come from the English block when the page is not Greek and that
 * block names them. Otherwise the Greek words stay — better than nothing.
 */
export function localizeBoxFacts(facts: BoxFacts, localRows: TechRow[]): BoxFacts {
  if (localRows.length === 0) return facts;
  const find = (label: RegExp) => localRows.find((r) => label.test(r.label))?.value.trim();
  const caseValue = find(CASE_LABEL);
  const accessories = find(ACCESSORIES_LABEL);
  return {
    ...facts,
    case: facts.case && caseValue && !NEGATIVE.test(caseValue) ? caseValue : facts.case,
    accessories:
      facts.accessories.length > 0 && accessories ? splitItems(accessories) : facts.accessories,
  };
}

/** Battery families Milwaukee sells, most common first: B5, then HB, then FORGE. */
const BATTERY_FAMILIES = ["B", "HB", "FB"] as const;

const IS_BATTERY = /(^|\s)(ΜΠΑΤΑΡΙΑ|BATTERY|BATTERIA)(\s|$)/i;

/**
 * The catalogue's own battery for a platform and capacity — "M18 B5" for a
 * 5.0Ah M18 kit — so the in-the-box tile and the same-battery band can link
 * to it. Whole-word match: "M18 B5-CR" is a different battery. Among equals,
 * one in stock wins.
 */
export function matchBattery<T extends { name: string; inStock?: boolean }>(
  candidates: T[],
  platform: Platform | null,
  ah: number,
): { product: T; code: string } | null {
  if (platform !== "M12" && platform !== "M18") return null;
  const ahToken = String(ah).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const family of BATTERY_FAMILIES) {
    const re = new RegExp(`(^|\\s)${platform} ?${family}${ahToken}(?=\\s|$)`);
    const hits = candidates.filter(
      (c) => IS_BATTERY.test(c.name) && re.test(normalizeModelText(c.name.toUpperCase())),
    );
    if (hits.length) {
      const product = hits.find((h) => h.inStock) ?? hits[0];
      return { product, code: `${platform} ${family}${ah}` };
    }
  }
  return null;
}

export type BoxTile<T> =
  | { kind: "tool"; qty: string }
  | { kind: "battery"; qty: string; ah: number; code: string | null; product: T | null }
  | { kind: "charger"; qty: string; model: string }
  | { kind: "case"; qty: string; value: string }
  | { kind: "accessories"; qty: string; items: string[] };

/**
 * pdp.html «ΣΤΗ ΣΥΣΚΕΥΑΣΙΑ», from the manufacturer's lines: the tool, its
 * batteries (linked to our own battery product when the catalogue has it),
 * the charger, the case and the standard accessories.
 *
 * Empty when the block names none of these — a lone "1× the tool" tile says
 * nothing the photo does not.
 */
export function inTheBox<T extends { name: string; inStock?: boolean }>({
  facts,
  platform,
  isTool,
  kitFallback,
  batteries,
}: {
  facts: BoxFacts;
  platform: Platform | null;
  /** A tool with a model code — the first tile is the tool itself. */
  isTool: boolean;
  /** From the model suffix, when the block does not say (kits only). */
  kitFallback?: { batteries: number; ah: number } | null;
  batteries: T[];
}): BoxTile<T>[] {
  const tiles: BoxTile<T>[] = [];

  const kit = facts.batteries ?? (kitFallback ? { count: kitFallback.batteries, ah: kitFallback.ah } : null);
  if (kit) {
    const match = matchBattery(batteries, platform, kit.ah);
    tiles.push({
      kind: "battery",
      qty: `${kit.count}×`,
      ah: kit.ah,
      code: match?.code ?? null,
      product: match?.product ?? null,
    });
  }
  if (facts.charger != null) tiles.push({ kind: "charger", qty: "1×", model: facts.charger });
  if (facts.case) tiles.push({ kind: "case", qty: "1×", value: facts.case });
  if (facts.accessories.length) {
    const n = facts.accessories.length;
    tiles.push({
      kind: "accessories",
      qty: n <= 3 ? Array.from({ length: n }, () => "1").join("+") : `${n}×`,
      items: facts.accessories,
    });
  }

  if (tiles.length === 0) return [];
  return isTool ? [{ kind: "tool", qty: "1×" }, ...tiles] : tiles;
}
