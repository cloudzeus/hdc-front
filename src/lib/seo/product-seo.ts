import type { Locale } from "@/i18n/routing";
import type { Availability } from "@/lib/catalog/availability";
import { searchKey } from "@/lib/greek";
import { displayName } from "@/lib/milwaukee/display";
import { normalizeModelText, parseModel } from "@/lib/milwaukee/model";
import { clampDescription, cutAtWord } from "@/lib/seo/size-variant";

/**
 * The product page's <title>, H1 and meta description — what someone who
 * searched a model («M18 FPD3») or an article number (4933479860) must find.
 *
 *   <title>  Milwaukee {model} {kind} | {code}      ≤ 65, the kind is cut first
 *   H1       Milwaukee {kind} {model}               the bare tool and each kit differ
 *   meta     kind + model, code, first key figure, availability, Piraeus
 *
 * The «kind» is what the tool is, read off the ERP name («ΚΡΟΥΣΤΙΚΟ
 * ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ»). ERP names are capitals without accents, and lowering
 * them would misspell every word («κρουστικο»), so the accents are recovered
 * from the product's own Greek descriptions, word by word; when a word cannot
 * be found there the kind stays in capitals — correct, if loud.
 *
 * Pure and tested (product-seo.test.ts); the page passes the data in.
 */

export type ProductSeoInput = {
  locale: Locale;
  /** The page language's product name (a translation), for en/it. */
  name: string;
  /** The ERP (Greek) name: the model code lives here. */
  erpName: string;
  /** The Milwaukee article number (or the SKU when there is none). */
  code2: string;
  /** Greek text about the product (short and long description), for accents. */
  greekTexts: Array<string | null | undefined>;
  /** Every Greek word we hold, for the accents the product's own text lacks. */
  lexicon?: Lexicon;
};

export type KeySpec = { key: "torque" | "speed" | "impact" | "energy" | "chuck" | "drive"; value: string; unit: string };

const TITLE_MAX = 65;
const GREEK_WORD = /^[\p{Script=Greek}]+$/u;
/** Words that repeat the model or the brand rather than say what the tool is. */
const NOISE = /^(FUEL(™)?|BRUSHLESS|CORDLESS|MILWAUKEE|M12|M18|MX|MXF|\d+(\.\d+)?V|™|®)$/i;

const tidy = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,;·–-]+|[\s,;·–-]+$/g, "").trim();

/** The model code as Milwaukee writes it, «M18 FPD3-502X», or null. */
export function modelCode(erpName: string): string | null {
  return parseModel(erpName)?.code ?? null;
}

/** Every Greek word in the texts, by its accent-free key, as first written. */
function accentIndex(texts: Array<string | null | undefined>): Map<string, string> {
  const index = new Map<string, string>();
  for (const text of texts) {
    if (!text) continue;
    for (const word of text.match(/[\p{Script=Greek}]+/gu) ?? []) {
      const key = searchKey(word);
      if (!index.has(key)) index.set(key, word.toLocaleLowerCase("el"));
    }
  }
  return index;
}

/**
 * Greek words by their accent-free key (`searchKey`), spelt as written:
 * «κρουστικα» → «κρουστικά». Built from any Greek text we hold
 * (src/lib/catalog/greek-lexicon.ts); a fallback when the product's own
 * descriptions do not use a word.
 */
export type Lexicon = Record<string, string>;

/** «ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ» → «Κρουστικό δραπανοκατσάβιδο», or as is. */
export function withAccents(kind: string, texts: Array<string | null | undefined>, lexicon: Lexicon = {}): string {
  const words = kind.split(" ");
  if (!words.some((w) => /\p{Script=Greek}/u.test(w))) return kind;
  const index = accentIndex(texts);
  const out: string[] = [];
  for (const word of words) {
    if (!/\p{Script=Greek}/u.test(word)) {
      out.push(word);
      continue;
    }
    const key = searchKey(word);
    const found = GREEK_WORD.test(word) ? (index.get(key) ?? lexicon[key]) : undefined;
    if (!found) return kind; // one word we cannot spell: keep the capitals
    out.push(found);
  }
  const text = out.join(" ");
  return text.charAt(0).toLocaleUpperCase("el") + text.slice(1);
}

/** What the product is, in Greek, from the ERP name. */
export function greekKind(input: Pick<ProductSeoInput, "erpName" | "code2" | "greekTexts" | "lexicon">): string {
  const clean = normalizeModelText(displayName(input.erpName, input.code2));
  const code = modelCode(clean);
  let kind = clean;
  if (code) {
    const at = clean.indexOf(code);
    const before = at >= 0 ? clean.slice(0, at) : "";
    const after = at >= 0 ? clean.slice(at + code.length) : clean.replace(code, " ");
    kind = before.trim() ? before : after;
  }
  kind = tidy(
    kind
      .split(" ")
      .filter((w) => !NOISE.test(w))
      .join(" "),
  );
  return kind ? withAccents(kind, input.greekTexts, input.lexicon) : "";
}

/** What the product is, in the page's language (en/it from the translated name). */
function localKind(input: ProductSeoInput): string {
  if (input.locale === "el" || !input.name.trim()) return greekKind(input);
  const code = modelCode(input.erpName);
  let text = displayName(input.name, input.code2).replace(/\([^)]*\)/g, " ");
  if (code) {
    const [platform, rest] = code.split(" ");
    text = normalizeModelText(text)
      .replace(code, " ")
      .replace(new RegExp(`\\b${platform}\\s?${rest}\\b`, "i"), " ");
  }
  const kind = tidy(
    text
      .split(/\s+/)
      .filter((w) => !NOISE.test(w))
      .join(" "),
  );
  return kind || greekKind(input);
}

export function productTitle(input: ProductSeoInput): string {
  const code = modelCode(input.erpName);
  const kind = localKind(input);
  const head = code ? `Milwaukee ${code}` : "Milwaukee";
  const tail = input.code2 ? ` | ${input.code2}` : "";
  const room = TITLE_MAX - head.length - tail.length - 1;
  const cut = kind && room >= 4 ? cutAtWord(kind, room) : "";
  return `${head}${cut ? ` ${cut}` : ""}${tail}`;
}

export function productH1(input: ProductSeoInput): string {
  const code = modelCode(input.erpName);
  const kind = localKind(input);
  return tidy(["Milwaukee", kind, code].filter(Boolean).join(" "));
}

const TEXT = {
  el: {
    code: "κωδικός",
    stock: "Σε απόθεμα.",
    last: "Τελευταίο τεμάχιο σε απόθεμα.",
    supplier: "Διαθέσιμο, αποστολή σε 3–5 εργάσιμες.",
    order: "Παράδοση σε 1–3 εργάσιμες.",
    store: "Παραλαβή από το κατάστημα στον Πειραιά ή αποστολή σε όλη την Ελλάδα.",
    storeShort: "Παραλαβή στον Πειραιά ή αποστολή.",
    spec: {
      torque: (v: string) => `ροπή ${v} Nm`,
      speed: (v: string) => `έως ${v} σ.α.λ.`,
      impact: (v: string) => `${v} κρούσεις/λεπτό`,
      energy: (v: string) => `ενέργεια κρούσης ${v} J`,
      chuck: (v: string) => `τσοκ ${v} mm`,
      drive: (v: string) => `υποδοχή ${v}`,
    },
  },
  en: {
    code: "article number",
    stock: "In stock.",
    last: "Last one in stock.",
    supplier: "Available, ships in 3–5 working days.",
    order: "Delivery in 1–3 working days.",
    store: "Collect from our store in Piraeus or have it delivered across Greece.",
    storeShort: "Pickup in Piraeus or delivery.",
    spec: {
      torque: (v: string) => `torque ${v} Nm`,
      speed: (v: string) => `up to ${v} rpm`,
      impact: (v: string) => `${v} bpm`,
      energy: (v: string) => `impact energy ${v} J`,
      chuck: (v: string) => `${v} mm chuck`,
      drive: (v: string) => `${v} drive`,
    },
  },
  it: {
    code: "codice",
    stock: "Disponibile a magazzino.",
    last: "Ultimo pezzo a magazzino.",
    supplier: "Disponibile, spedizione in 3–5 giorni lavorativi.",
    order: "Consegna in 1–3 giorni lavorativi.",
    store: "Ritiro nel negozio al Pireo o spedizione in tutta la Grecia.",
    storeShort: "Ritiro al Pireo o spedizione.",
    spec: {
      torque: (v: string) => `coppia ${v} Nm`,
      speed: (v: string) => `fino a ${v} giri/min`,
      impact: (v: string) => `${v} colpi/min`,
      energy: (v: string) => `energia d'impatto ${v} J`,
      chuck: (v: string) => `mandrino ${v} mm`,
      drive: (v: string) => `attacco ${v}`,
    },
  },
} as const;

/**
 * The meta description: kind and model, code, the first key figure, the
 * availability the page states, and Piraeus — at most 155 characters. When it
 * does not fit, the store line is shortened first, then the kind goes; never
 * the code, the model or Piraeus.
 */
export function productDescription(
  input: ProductSeoInput & { availability: Availability; qty: number; keySpec: KeySpec | null },
): string {
  const text = TEXT[input.locale];
  const code = modelCode(input.erpName);
  const kind = localKind(input);
  const spec = input.keySpec ? text.spec[input.keySpec.key](input.keySpec.value) : null;
  const availability =
    input.availability === "stock"
      ? input.qty === 1
        ? text.last
        : text.stock
      : input.availability === "supplier"
        ? text.supplier
        : text.order;

  const build = (withKind: boolean, store: string) => {
    const who = tidy([withKind ? kind : "", "Milwaukee", code].filter(Boolean).join(" "));
    const id = `${who}, ${text.code} ${input.code2}${spec ? `: ${spec}` : ""}.`;
    return `${id} ${availability} ${store}`;
  };

  for (const candidate of [
    build(true, text.store),
    build(true, text.storeShort),
    build(false, text.store),
    build(false, text.storeShort),
  ]) {
    if (candidate.length <= 155) return candidate;
  }
  return clampDescription(build(false, text.storeShort));
}

/**
 * The Merchant feed title: «Milwaukee {model} {kind} {code}» — the same words
 * as the page title, without the separator, within Google's 150 characters.
 */
export function productFeedTitle(input: ProductSeoInput): string {
  const code = modelCode(input.erpName);
  return tidy(["Milwaukee", code, localKind(input), input.code2].filter(Boolean).join(" ")).slice(0, 150);
}
