import { slugify } from "@/lib/greek";

/**
 * 301s from the old milwaukeetoolshdc.gr to the new shop on the same domain.
 *
 * ── What the old site was ──────────────────────────────────────────────────
 *
 * A headless storefront over Magento (magento.kolleris.com), fed from the same
 * HDCtool PIM as this shop. Its URLs, read off its own pages on 30/9/2026:
 *
 *   product    /mpataria-18v-5-0ah-m18-b5-4932430483   name slug + SKU (= code2)
 *   category   /category-12-ergaleia-mpatarias          Magento id + name slug
 *   page       /terms-and-conditions, /track-order, …
 *
 * Classic Magento shapes (`*.html`, `/customer/*`, `/checkout/cart`,
 * `/catalogsearch/result?q=`) are handled as well: they cost nothing, and any
 * link or bookmark from before the headless storefront still lands.
 *
 * ── Why a code map and not a URL list ──────────────────────────────────────
 *
 * The old site's robots.txt is `Disallow: /`, so its sitemap was not crawled.
 * It does not need to be: the SKU is IN every product URL, and the SKU is our
 * `code2`. So the table maps every normalised code (code2, code, code1) to its
 * product, and every category name to its category — which covers every old
 * product URL there ever was, not only those a sitemap happened to list.
 * `redirects` still takes explicit `{ from, to, kind }` rows, for paths a
 * sitemap or a Search Console export adds later (scripts/seo/magento-redirects.ts).
 *
 * ── Nothing ends on a 404 ──────────────────────────────────────────────────
 *
 * A product or category that is not found goes to the search for its code or
 * name: a customer following an old link gets the closest thing we have.
 *
 * Edge-safe and dependency-light: this runs inside the proxy.
 */

export type MagentoKind = "product" | "category" | "page" | "search";

export type MagentoRedirect = { from: string; to: string; kind: MagentoKind };

export type MagentoTable = {
  /** Normalised code (see `normaliseCode`) → product slug. */
  products: Record<string, string>;
  /** Category name skeleton (see `categorySkeleton`) → category slug. */
  categories: Record<string, string>;
  /** Explicit old paths, lower-case, no trailing slash. Checked first. */
  redirects: MagentoRedirect[];
  /** What was left out because it would have been a guess. For the report. */
  ambiguous: { codes: string[]; categories: string[] };
};

/** Strip spaces and dashes, ignore case: «48-22-7314» = «48227314». */
export function normaliseCode(code: string): string {
  return code.replace(/[\s-]+/g, "").toUpperCase();
}

/**
 * One key for the old and the new transliteration of a Greek name.
 *
 * The old site wrote β as b, μπ as mp and ου as oy («ergaleia-mpatarias»,
 * «solinokaboyras»); `slugify` writes β as v, μπ as b and ου as ou
 * («ergaleia-batarias», «solinokavouras»). Folding mp→b, then b→v, and oy→ou
 * on both sides makes the two meet. Hyphens are dropped.
 */
export function categorySkeleton(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/mp/g, "b")
    .replace(/b/g, "v")
    .replace(/oy/g, "ou");
}

/**
 * The old site's own pages. Those in the first group were linked from its
 * pages; the rest are the usual Magento/PWA names — a rule for a path nobody
 * requests costs nothing.
 */
export const MAGENTO_PAGES: Record<string, string> = {
  "/terms-and-conditions": "/oroi-chrisis",
  "/shipment-delivery": "/apostoli-paradosi",
  "/track-order": "/logariasmos/entopismos",
  "/contact-us": "/epikoinonia",
  "/about-us": "/etaireia",
  "/careers": "/etaireia",
  "/reviews": "/etaireia",
  "/payment-methods": "/tropoi-pliromis",
  "/privacy-policy": "/aporrito",
  "/return-policy": "/epistrofes",
  "/faqs": "/syxnes-erotiseis",
  "/new-products": "/nees-afixeis",
  "/top-products": "/proionta",
  "/popular-products": "/proionta",
  "/category-listing": "/katalogos",
  // Not seen on the old site; common names.
  "/contact": "/epikoinonia",
  "/privacy-policy-cookie-restriction-mode": "/aporrito",
  "/cookie-policy": "/aporrito",
  "/returns": "/epistrofes",
  "/faq": "/syxnes-erotiseis",
  "/warranty": "/eggyiseis",
  "/cart": "/kalathi",
  "/login": "/eisodos",
  "/sign-in": "/eisodos",
  "/register": "/eggrafi",
  "/create-account": "/eggrafi",
  "/my-account": "/logariasmos",
  "/account": "/logariasmos",
  "/wishlist": "/logariasmos/agapimena",
  "/offers": "/prosfores",
  "/special-offers": "/prosfores",
};

/** Classic Magento routes, by prefix. Order matters: most specific first. */
const MAGENTO_PREFIXES: Array<[RegExp, string]> = [
  [/^\/customer\/account\/(login|forgotpassword)(\/|$)/, "/eisodos"],
  [/^\/customer\/account\/create(\/|$)/, "/eggrafi"],
  [/^\/customer(\/|$)/, "/logariasmos"],
  [/^\/wishlist(\/|$)/, "/logariasmos/agapimena"],
  [/^\/sales\/order(\/|$)/, "/logariasmos/paraggelies"],
  // Only Magento's own checkout paths: /checkout/epibebaiosi/* is ours.
  [/^\/checkout\/(cart|onepage|index)(\/|$)/, "/kalathi"],
];

const SEARCH_PATH = /^\/(catalogsearch\/result|search)(\/|$)/;
const CATEGORY_PATH = /^\/category-\d+-([a-z0-9-]+?)(\/.*)?$/;
/** A Google/Bing site-verification file — must reach the file, not the search. */
const VERIFICATION_FILE = /^\/(google[0-9a-f]+|BingSiteAuth|yandex_[0-9a-f]+)\.html$/i;
/** One segment, hyphenated, ending in a token that holds a code (≥ 4 digits). */
const PRODUCT_SHAPE = /^\/[a-z0-9]+(?:-[a-z0-9]+)*-(?=[a-z0-9]*\d[a-z0-9]*\d[a-z0-9]*\d[a-z0-9]*\d)[a-z0-9]+\/?$/i;

function clean(pathname: string): string {
  let path = pathname.toLowerCase();
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep as is
  }
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/**
 * Whether the proxy should consult the table for this path at all. Cheap and
 * conservative: nothing of the new shop's routes matches, so a normal request
 * never pays for the lookup.
 */
export function isMagentoCandidate(pathname: string): boolean {
  if (VERIFICATION_FILE.test(pathname)) return false;
  const path = clean(pathname);
  if (path.endsWith(".html")) return true;
  if (MAGENTO_PAGES[path]) return true;
  if (SEARCH_PATH.test(path) || CATEGORY_PATH.test(path)) return true;
  if (MAGENTO_PREFIXES.some(([re]) => re.test(path))) return true;
  return PRODUCT_SHAPE.test(path);
}

export type ProductRow = {
  code: string;
  code1: string;
  code2: string;
  slug: string;
  /** HDCtool MTRL: negative for an XML-only row that may twin an ERP one. */
  mtrl?: number;
};
/** `level`: 0 category, 1 group, 2 subgroup. */
export type CategoryRow = { slug: string; nameEl: string; productCount: number; level?: number };

/**
 * The one owner of a key, or null when choosing would be a guess.
 *
 * Narrowed step by step, stopping as soon as one is left: the preferred
 * candidates (for a code: those whose code2 it is; for a name: the shallowest
 * level), then the ERP rows. Two ERP products still sharing a code stay
 * ambiguous — a wrong 301 is worse than a search.
 */
function soleOwner<T extends { slug: string }>(owners: T[], filters: Array<(o: T) => boolean>): string | null {
  let pool = [...new Map(owners.map((o) => [o.slug, o])).values()];
  for (const keep of filters) {
    if (pool.length === 1) break;
    const narrowed = pool.filter(keep);
    if (narrowed.length) pool = narrowed;
  }
  return pool.length === 1 ? pool[0].slug : null;
}

/**
 * The lookup table, from the new shop's catalogue. A code or a category name
 * that cannot be pinned to one page is left out and listed in `ambiguous`.
 */
export function buildMagentoTable(input: {
  products: ProductRow[];
  categories: CategoryRow[];
  redirects?: MagentoRedirect[];
}): MagentoTable {
  type CodeOwner = { slug: string; mtrl: number; isCode2: boolean };
  const codeOwners = new Map<string, CodeOwner[]>();
  for (const p of input.products) {
    const code2 = normaliseCode(p.code2 ?? "");
    for (const raw of [p.code2, p.code, p.code1]) {
      const code = normaliseCode(raw ?? "");
      if (code.length < 5) continue;
      const owners = codeOwners.get(code) ?? [];
      owners.push({ slug: p.slug, mtrl: p.mtrl ?? 1, isCode2: code === code2 });
      codeOwners.set(code, owners);
    }
  }
  const products: Record<string, string> = {};
  const ambiguousCodes: string[] = [];
  for (const [code, owners] of [...codeOwners.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const slug = soleOwner(owners, [(o) => o.isCode2, (o) => o.mtrl > 0]);
    if (slug) products[code] = slug;
    else ambiguousCodes.push(code);
  }

  type NameOwner = { slug: string; level: number };
  const nameOwners = new Map<string, NameOwner[]>();
  for (const c of input.categories) {
    if (c.productCount <= 0) continue;
    const key = categorySkeleton(slugify(c.nameEl) || c.slug);
    const owners = nameOwners.get(key) ?? [];
    owners.push({ slug: c.slug, level: c.level ?? 0 });
    nameOwners.set(key, owners);
  }
  const categories: Record<string, string> = {};
  const ambiguousCategories: string[] = [];
  for (const [key, owners] of [...nameOwners.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const top = Math.min(...owners.map((o) => o.level));
    const slug = soleOwner(owners, [(o) => o.level === top]);
    if (slug) categories[key] = slug;
    else ambiguousCategories.push(key);
  }

  return {
    products,
    categories,
    redirects: (input.redirects ?? []).map((r) => ({ ...r, from: clean(r.from) })),
    ambiguous: { codes: ambiguousCodes, categories: ambiguousCategories },
  };
}

const searchFor = (q: string) => (q ? `/anazitisi?q=${encodeURIComponent(q)}` : "/anazitisi");

/** The code-ish candidates at the end of a slug, longest first. */
function codeCandidates(segment: string): string[] {
  const tokens = segment.split("-").filter(Boolean);
  const out: string[] = [];
  for (let n = Math.min(3, tokens.length); n >= 1; n--) {
    out.push(tokens.slice(-n).join(""));
  }
  for (const t of tokens) if (/^\d{8,14}$/.test(t)) out.push(t);
  return out.map(normaliseCode).filter((c) => c.length >= 5);
}

/** The trailing all-digit tokens joined — what to search for when nothing matches. */
function trailingCode(segment: string): string | null {
  const tokens = segment.split("-");
  const digits: string[] = [];
  for (let i = tokens.length - 1; i >= 0 && digits.length < 3 && /^\d+$/.test(tokens[i]); i--) {
    digits.unshift(tokens[i]);
  }
  const code = digits.join("");
  return code.length >= 4 ? code : null;
}

const words = (slug: string) => slug.replace(/-+/g, " ").trim();

/**
 * The resolver: builds its Maps once, then answers each path in O(1) lookups.
 * Returns `null` for a path that is not the old site's.
 */
export function createMagentoResolver(table: MagentoTable) {
  const products = new Map(Object.entries(table.products));
  const categories = new Map(Object.entries(table.categories));
  const explicit = new Map(table.redirects.map((r) => [r.from, r]));
  const pages = new Map(Object.entries(MAGENTO_PAGES));

  const product = (segment: string) => {
    for (const code of codeCandidates(segment)) {
      const slug = products.get(code);
      if (slug) return `/proion/${slug}`;
    }
    return null;
  };
  const category = (segment: string) => {
    const slug = categories.get(categorySkeleton(segment));
    return slug ? `/katalogos/${slug}` : null;
  };

  return function resolve(pathname: string, search: string): { to: string; kind: MagentoKind } | null {
    if (!isMagentoCandidate(pathname)) return null;
    const path = clean(pathname);

    const hit = explicit.get(path) ?? explicit.get(path.replace(/\.html$/, ""));
    if (hit) return { to: hit.to, kind: hit.kind };

    const page = pages.get(path);
    if (page) return { to: page, kind: "page" };

    if (SEARCH_PATH.test(path)) {
      const params = new URLSearchParams(search);
      const q = (params.get("q") ?? params.get("query") ?? params.get("text") ?? "").trim();
      return { to: searchFor(q), kind: "search" };
    }

    for (const [re, to] of MAGENTO_PREFIXES) if (re.test(path)) return { to, kind: "page" };

    const cat = CATEGORY_PATH.exec(path);
    if (cat) {
      const to = category(cat[1]);
      return to ? { to, kind: "category" } : { to: searchFor(words(cat[1])), kind: "search" };
    }

    const segment = path.replace(/\.html$/, "").split("/").filter(Boolean).pop() ?? "";

    const productTo = product(segment);
    if (productTo) return { to: productTo, kind: "product" };

    const code = trailingCode(segment);
    if (code) return { to: searchFor(code), kind: "search" };

    const categoryTo = category(segment);
    if (categoryTo) return { to: categoryTo, kind: "category" };

    return { to: searchFor(words(segment)), kind: "search" };
  };
}
