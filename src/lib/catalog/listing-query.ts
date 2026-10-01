import { SHOP } from "@/config/shop";
import {
  parseAvail,
  parseContent,
  parsePlatform,
  parseSeries,
} from "@/lib/catalog/hdc-filters";
import {
  PER_PAGE_OPTIONS,
  PER_ROW_OPTIONS,
  PRICE_BANDS,
  SORT_OPTIONS,
} from "@/lib/catalog/plp-options";

/**
 * The query string of a product listing, reduced to ONE spelling.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * On 1/10/2026 a distributed scraper (hundreds of cloud IPs, spoofed browser
 * user agents) walked the facet space of the Kolleris catalogue — the shop this
 * one was copied from — and took it down: every random combination of facets,
 * prices and page sizes was a cache miss and a full render. This shop has the
 * same parser, plus the Milwaukee filters and a free price slider, so its
 * facet space was just as infinite. This module makes it finite and small:
 *
 *   - only the parameters a listing actually reads survive;
 *   - multi-value facets are deduplicated, their values put in one order and
 *     capped (the order of the parameters themselves is left as it came: a
 *     redirect for a mere reordering would cost more than it saves), and
 *     the facet values together are capped at what the filter UI can produce;
 *   - prices are snapped onto a coarse grid (HDC listings) or must be one of
 *     the offered bands (the classic listings);
 *   - defaults (`page=1`, `perPage=24`, `sort=relevance`) are dropped, and
 *     `page` and `q` are clamped;
 *   - `perRow` is a display preference, not a different page: it becomes a
 *     cookie and leaves the URL.
 *
 * Every rule is a REWRITE (a 301 to the canonical URL), never a refusal: an
 * old link, a hand-edited URL or a filter combination nobody foresaw lands on
 * the nearest real listing, not on an error page.
 *
 * Pure and dependency-free (no Prisma, no Next) so the proxy can run it on
 * every request before anything touches the database, and so the pages and
 * the link builders share the exact same rules.
 *
 * ── Two families of listing ────────────────────────────────────────────────
 *
 *   HDC      the category page and search results (`HdcListing`): platform,
 *            availability, content, series, categories, a free price range in
 *            euros WITH VAT, sort, and load-more paging (`page` N = pages 1..N).
 *   classic  brand, offer and all-products pages (`FilterSidebar`): categories,
 *            brands, price bands, availability, sale, new, sort, page size,
 *            density, numbered paging.
 */

export type ListingKind = "category" | "brand" | "products" | "offers" | "search";

export const LISTING_LIMITS = {
  /** Values of one multi-value facet. The filter UI replaces the oldest beyond this. */
  maxValuesPerFacet: 3,
  /**
   * Every facet value counted together: the most the filter UI can produce.
   * All products and offers: 3 categories + 3 brands + price + availability +
   * sale + new = 10 (search: 3 categories + platform + availability + content
   * + 2 series + price = 9). A legacy link past it is trimmed, never refused.
   */
  maxFacetValues: 10,
  /**
   * Numbered paging: far past the largest listing at 24 a page. Beyond it the
   * URL is clamped here, and a page past the end renders the normal empty
   * state with the pagination back.
   */
  maxPage: 400,
  /**
   * Load-more: page N draws pages 1..N in one render, and `getPlpData` never
   * draws more than this many. A higher `page` is the same render, so it is
   * one URL.
   */
  maxCumulativePage: 60,
  /** Load-more depth from which an HDC listing costs like a filtered one. */
  costlyCumulativePage: 5,
  /** Characters of a search query; the header search box has the same maxLength. */
  maxQueryLength: 200,
  maxSlugLength: 120,
} as const;

/** The perRow preference lives here instead of in the URL. */
export const PER_ROW_COOKIE = `${SHOP.cookiePrefix}PER_ROW`;
export const DEFAULT_PER_ROW = 4;
export const DEFAULT_PER_PAGE = 24;

const HDC_KINDS: ReadonlySet<ListingKind> = new Set(["category", "search"]);

/** Whether a listing is an HDC one: gross free prices, load-more paging, Milwaukee filters. */
export function isHdcListing(kind: ListingKind): boolean {
  return HDC_KINDS.has(kind);
}

const HDC_FACETS = ["platform", "sub", "avail", "content", "series", "min", "max"];
const CLASSIC_FACETS = ["sub", "brand", "min", "max", "avail", "sale", "new"];

/*
 * What each page reads AND its own UI emits. The brand page renders no brand
 * facet (`getFacets` leaves it empty under a brand scope), so `?brand=` there
 * is the one classic param that goes; nothing a page's own links use is
 * stripped.
 */
const PARAMS_BY_KIND: Record<ListingKind, readonly string[]> = {
  category: [...HDC_FACETS, "sort", "page"],
  search: ["q", "cat", ...HDC_FACETS, "sort", "page"],
  brand: [...CLASSIC_FACETS.filter((k) => k !== "brand"), "sort", "page", "perPage"],
  products: [...CLASSIC_FACETS, "sort", "page", "perPage"],
  offers: [...CLASSIC_FACETS, "sort", "page", "perPage"],
};

/**
 * Kept untouched and never counted as a filter.
 *
 * `_rsc` is the router's own cache-busting parameter on client navigations —
 * redirecting it away would break every filter click. The rest are campaign
 * attribution: stripping them with a redirect would erase the click from
 * analytics before the tag manager ever saw it. None of them changes what the
 * page renders, and none of them is part of any cache key.
 */
const PASS_THROUGH = new Set([
  "_rsc",
  "gclid",
  "gclsrc",
  "gbraid",
  "wbraid",
  "gad_source",
  "gad_campaignid",
  "dclid",
  "_gl",
  "_ga",
  "irclickid",
  "awc",
  "cjevent",
  "fbclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "_kx",
  "ttclid",
  "twclid",
  "li_fat_id",
  "yclid",
  "igshid",
  "_hsenc",
  "_hsmi",
  "srsltid",
]);

/** Campaign parameter families, by prefix: Google/UTM, Matomo and Piwik. */
const PASS_THROUGH_PREFIXES = ["utm_", "mtm_", "matomo_", "pk_"];

/** Attribution and router parameters: the prefixed families and the click ids above. */
export function isPassThroughParam(key: string): boolean {
  return PASS_THROUGH.has(key) || PASS_THROUGH_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Slugs are produced by `slugify` — kept permissive so no real slug is lost. */
const SLUG = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;

function isSlug(value: string): boolean {
  return value.length <= LISTING_LIMITS.maxSlugLength && SLUG.test(value);
}

/**
 * Which listing a pathname is, if any. Accepts the locale prefix that
 * `localePrefix: "as-needed"` puts in front of `/en` and `/it`.
 */
export function listingKindOf(pathname: string): ListingKind | null {
  const path = pathname.replace(/^\/(?:el|en|it)(?=\/|$)/, "") || "/";
  if (/^\/katalogos\/[^/]+\/?$/.test(path)) return "category";
  if (/^\/brands\/[^/]+\/?$/.test(path)) return "brand";
  if (/^\/proionta\/?$/.test(path)) return "products";
  if (/^\/prosfores\/[^/]+\/?$/.test(path)) return "offers";
  if (/^\/anazitisi\/?$/.test(path)) return "search";
  return null;
}

/* ── Prices ─────────────────────────────────────────────────────────────── */

/** The largest price an HDC range may name; above it the range is open-ended. */
export const MAX_PRICE = 100_000;

/** The grid step for a price: 10 € below 100, 50 € below 1.000, 100 € below 10.000, then 1.000 €. */
function priceStep(value: number): number {
  if (value < 100) return 10;
  if (value < 1_000) return 50;
  if (value < 10_000) return 100;
  return 1_000;
}

/**
 * A lower bound snapped DOWN onto the grid, an upper bound snapped UP: the
 * range only ever widens, so nobody loses a product they asked for. Every
 * grid point is a fixed point of both, and 100, 1.000 and 10.000 are on both
 * sides' grids, so snapping twice changes nothing.
 */
export function floorPrice(value: number): number {
  const v = Math.min(MAX_PRICE, Math.max(0, value));
  const step = priceStep(v);
  return Math.floor(v / step) * step;
}

export function ceilPrice(value: number): number {
  const v = Math.min(MAX_PRICE, Math.max(0, value));
  const step = priceStep(v);
  // Snapping up can cross into the next band (95 → 100): still a grid point.
  return Math.min(MAX_PRICE, Math.ceil(v / step) * step);
}

function priceNumber(value: string | undefined): number | null {
  if (value == null || !/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  return Number(value.trim());
}

/**
 * An HDC price range on the grid: min snapped down, max snapped up, a range
 * given backwards turned round, and bounds that filter nothing dropped (a
 * minimum of 0, a maximum at the ceiling).
 */
export function canonicalPriceRange(
  minRaw: string | undefined,
  maxRaw: string | undefined,
): { min: number | null; max: number | null } {
  let min = priceNumber(minRaw);
  let max = priceNumber(maxRaw);
  if (min != null && max != null && min > max) [min, max] = [max, min];
  const lo = min == null ? null : floorPrice(min);
  const hi = max == null ? null : ceilPrice(max);
  return {
    min: lo != null && lo > 0 ? lo : null,
    max: hi != null && hi < MAX_PRICE ? hi : null,
  };
}

/** The band whose bounds are exactly these, or null. Only bands the UI offers are valid. */
function matchBand(min: number | null, max: number | null) {
  return (
    PRICE_BANDS.find((band) => (band.min ?? null) === min && (band.max ?? null) === max) ?? null
  );
}

/* ── The combined facet cap ─────────────────────────────────────────────── */

type Pair = [string, string];

/**
 * The order facets keep their place in when a query holds more values than
 * the cap: the ones that narrow the most (categories, brands, platform) first,
 * the toggles last. Within a multi-value facet the first values in canonical
 * order stay. Deterministic, so trimming twice changes nothing.
 */
const CAP_PRIORITY = ["sub", "brand", "platform", "avail", "content", "series", "price", "sale", "new"];

/** How many facet values one canonical pair holds; min and max together are one ("price"). */
function unitsOf(key: string, value: string): number {
  switch (key) {
    case "sub":
    case "brand":
    case "content":
    case "series":
      return value.split(",").filter(Boolean).length;
    case "platform":
      return value === "all" ? 0 : 1;
    case "avail":
    case "sale":
    case "new":
      return 1;
    default:
      return 0;
  }
}

/**
 * Trims canonical pairs to `maxFacetValues`, in `CAP_PRIORITY` order. Pairs
 * that are not facets (sort, page, q, attribution) are never touched, and the
 * order of what remains is kept.
 */
export function trimToFacetCap(pairs: Pair[]): Pair[] {
  const hasPrice = pairs.some(([k]) => k === "min" || k === "max");
  let total = hasPrice ? 1 : 0;
  for (const [k, v] of pairs) total += unitsOf(k, v);
  if (total <= LISTING_LIMITS.maxFacetValues) return pairs;

  let budget = LISTING_LIMITS.maxFacetValues;
  const keep = new Map<string, string | null>();
  for (const facet of CAP_PRIORITY) {
    if (facet === "price") {
      if (!hasPrice) continue;
      const fits = budget >= 1;
      if (fits) budget -= 1;
      keep.set("min", fits ? "" : null);
      keep.set("max", fits ? "" : null);
      continue;
    }
    const pair = pairs.find(([k]) => k === facet);
    if (!pair) continue;
    const units = unitsOf(facet, pair[1]);
    if (units === 0) continue;
    if (facet === "sub" || facet === "brand" || facet === "content" || facet === "series") {
      const values = pair[1].split(",").filter(Boolean).slice(0, budget);
      budget -= values.length;
      keep.set(facet, values.length ? values.join(",") : null);
    } else {
      const fits = budget >= 1;
      if (fits) budget -= 1;
      keep.set(facet, fits ? pair[1] : null);
    }
  }

  const out: Pair[] = [];
  for (const [k, v] of pairs) {
    if (!keep.has(k)) out.push([k, v]);
    else {
      const kept = keep.get(k);
      if (kept == null) continue;
      out.push([k, kept === "" ? v : kept]);
    }
  }
  return out;
}

/* ── Canonicalisation ───────────────────────────────────────────────────── */

export type CanonicalResult =
  | { action: "ok" }
  /** `search` is "" or starts with "?". `perRow` is the preference to store, if any. */
  | { action: "redirect"; search: string; perRow: number | null };

/** Commas stay readable; everything else is percent-encoded. */
export function serializeQuery(pairs: Pair[]): string {
  if (pairs.length === 0) return "";
  return (
    "?" +
    pairs
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%2C/gi, ",")}`)
      .join("&")
  );
}

function slugValues(all: string[]): string[] {
  const set = new Set<string>();
  for (const raw of all) {
    for (const part of raw.split(",")) {
      const value = part.trim();
      if (value && isSlug(value)) set.add(value);
    }
  }
  return [...set].sort();
}

/** `platform`: one of the three, upper case, or `all` (explicit «ΟΛΕΣ»). */
function canonicalPlatform(value: string | undefined): string | null {
  if (value == null) return null;
  if (value.trim().toLowerCase() === "all") return "all";
  return parsePlatform(value) ?? null;
}

/** A search query cut to `maxQueryLength` characters (code points, not UTF-16 units). */
export function clampQuery(value: string): string {
  const chars = [...value];
  return chars.length > LISTING_LIMITS.maxQueryLength
    ? chars.slice(0, LISTING_LIMITS.maxQueryLength).join("")
    : value;
}

/**
 * Canonicalises a listing query string.
 *
 * Returns `ok` when the input is already canonical (semantically — encoding
 * differences such as `%2C` versus `,` do not cause a redirect), and
 * `redirect` with the canonical query when something was dropped, reordered,
 * trimmed, clamped or rounded.
 *
 * Idempotent: the canonical output of a redirect is itself `ok`.
 */
export function canonicalizeListingQuery(
  kind: ListingKind,
  search: string | URLSearchParams,
): CanonicalResult {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const allowed = new Set(PARAMS_BY_KIND[kind]);
  const hdc = isHdcListing(kind);

  const original: Pair[] = [...params.entries()];
  const keys: string[] = [];
  for (const [key] of original) if (!keys.includes(key)) keys.push(key);

  const first = (key: string) => params.get(key) ?? undefined;

  // Price is a pair: decided once, emitted where each key first appeared.
  const minRaw = allowed.has("min") ? first("min") : undefined;
  const maxRaw = allowed.has("max") ? first("max") : undefined;
  let price: { min: number | null; max: number | null } = { min: null, max: null };
  if (minRaw != null || maxRaw != null) {
    if (hdc) price = canonicalPriceRange(minRaw, maxRaw);
    else {
      const band = matchBand(priceNumber(minRaw), priceNumber(maxRaw));
      if (band) price = { min: band.min, max: band.max };
    }
  }

  let perRow: number | null = null;
  const out: Pair[] = [];

  for (const key of keys) {
    if (isPassThroughParam(key)) {
      for (const value of params.getAll(key)) out.push([key, value]);
      continue;
    }
    if (key === "perRow") {
      const n = Number(first(key));
      // Only the classic listings have a density control to remember.
      if (!hdc && (PER_ROW_OPTIONS as readonly number[]).includes(n)) perRow = n;
      continue;
    }
    if (!allowed.has(key)) continue;

    const value = first(key) ?? "";
    switch (key) {
      case "sub":
      case "brand": {
        const values = slugValues(params.getAll(key)).slice(0, LISTING_LIMITS.maxValuesPerFacet);
        if (values.length) out.push([key, values.join(",")]);
        break;
      }
      case "platform": {
        const platform = canonicalPlatform(value);
        if (platform) out.push([key, platform]);
        break;
      }
      case "content":
      case "series": {
        const values = (key === "content" ? parseContent : parseSeries)(params.getAll(key));
        if (values?.length) out.push([key, values.join(",")]);
        break;
      }
      case "avail": {
        // in-stock / order; both (or neither) is everything, which is no parameter.
        const avail = parseAvail(params.getAll(key));
        if (avail !== "all") out.push([key, avail]);
        break;
      }
      case "min":
      case "max": {
        const bound = key === "min" ? price.min : price.max;
        if (bound != null) out.push([key, String(bound)]);
        break;
      }
      case "sale":
      case "new":
        if (value === "1") out.push([key, value]);
        break;
      case "sort":
        if (value !== "relevance" && SORT_OPTIONS.some((o) => o.value === value)) {
          out.push([key, value]);
        }
        break;
      case "page": {
        if (!/^\d{1,9}$/.test(value)) break;
        const page = Math.min(
          Number(value),
          hdc ? LISTING_LIMITS.maxCumulativePage : LISTING_LIMITS.maxPage,
        );
        if (page > 1) out.push([key, String(page)]);
        break;
      }
      case "perPage": {
        const n = Number(value);
        if (n !== DEFAULT_PER_PAGE && (PER_PAGE_OPTIONS as readonly number[]).includes(n)) {
          out.push([key, String(n)]);
        }
        break;
      }
      case "q": {
        const q = clampQuery(value);
        if (q.trim()) out.push([key, q]);
        break;
      }
      case "cat":
        if (isSlug(value.trim())) out.push([key, value.trim()]);
        break;
    }
  }

  const canonical = trimToFacetCap(out);
  const unchanged =
    perRow === null &&
    canonical.length === original.length &&
    canonical.every(([k, v], i) => original[i][0] === k && original[i][1] === v);
  if (unchanged) return { action: "ok" };

  return { action: "redirect", search: serializeQuery(canonical), perRow };
}

/* ── Helpers for the pages, the link builders and the limiter ──────────── */

type RawParams = Record<string, string | string[] | undefined>;

/**
 * Whether a listing request is filtered: anything beyond paging, the
 * pass-through parameters and a lone platform. Filtered views are `noindex`,
 * nofollowed, disallowed in robots.txt, rate-limited harder and gated by the
 * render semaphore; a bare category and its `?page=` are not.
 *
 * Neither is a PLATFORM LANDING — `?platform=M18`, with or without `page`:
 * «M18 δραπανοκατσάβιδα» is a page people search for, the hubs and the product
 * pages link to it, and before the facet rules it was crawlable and indexable
 * (canonical to the category, no robots meta, not in the sitemap). It keeps
 * exactly that. Only a platform combined with other facets is a filtered view.
 */
export function isFilteredListing(params: URLSearchParams | RawParams): boolean {
  const keys = (
    params instanceof URLSearchParams
      ? [...new Set(params.keys())]
      : Object.keys(params).filter((k) => params[k] != null)
  ).filter((key) => key !== "page" && !isPassThroughParam(key));
  if (keys.length === 0) return false;
  if (keys.length === 1 && keys[0] === "platform") {
    const value = params instanceof URLSearchParams ? params.get("platform") : [params.platform].flat()[0];
    return canonicalPlatform(value ?? undefined) == null;
  }
  return true;
}

/**
 * `rel` for a link to a listing: `nofollow` when it leads into the facet
 * space, nothing when it leads to a bare listing or a platform landing.
 */
export function listingLinkRel(href: string): "nofollow" | undefined {
  const at = href.indexOf("?");
  if (at === -1) return undefined;
  return isFilteredListing(new URLSearchParams(href.slice(at))) ? "nofollow" : undefined;
}

/**
 * Whether a listing costs like a filtered one: it is filtered, or it is an
 * HDC listing deep into load-more — `?page=12` there renders 288 cards, not 24.
 * What the rate limit and the render gate go by; `noindex` stays with
 * `isFilteredListing`, since `?page=` of a bare listing is meant to be crawled.
 */
export function isCostlyListing(kind: ListingKind, params: URLSearchParams | RawParams): boolean {
  if (isFilteredListing(params)) return true;
  if (!isHdcListing(kind)) return false;
  const page = params instanceof URLSearchParams ? params.get("page") : [params.page].flat()[0];
  return Number(page) >= LISTING_LIMITS.costlyCumulativePage;
}

/**
 * `{ robots: noindex, follow }` for a filtered listing, nothing for a bare one
 * — spread into the page's metadata AFTER `pageMeta`, so the en/it `noindex`
 * it carries is not overwritten for a bare listing.
 *
 * The canonical already points every filtered view at the unfiltered listing;
 * a canonical is a hint, `noindex` is not. `follow` keeps the products linked
 * from the view discoverable.
 */
export function filteredListingMeta(
  params: RawParams,
): { robots: { index: false; follow: true } } | Record<string, never> {
  return isFilteredListing(params) ? { robots: { index: false, follow: true } } : {};
}

/**
 * Applies the per-facet cap the way a person expects when ticking one more:
 * the new value is kept and the oldest one (first in canonical order) gives
 * way. Used by the filter links so the UI never produces a URL the proxy would
 * have to rewrite.
 */
export function toggleCappedValue(current: string[], value: string): string[] {
  const set = new Set(current);
  if (set.has(value)) {
    set.delete(value);
    return [...set].sort();
  }
  const kept = [...set].sort();
  while (kept.length >= LISTING_LIMITS.maxValuesPerFacet) kept.shift();
  return [...kept, value].sort();
}

/** The multi-value cap applied to an already-parsed list (defence in depth for the pages). */
export function capFacetValues(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined;
  const clean = [...new Set(values.filter(isSlug))].sort();
  const capped = clean.slice(0, LISTING_LIMITS.maxValuesPerFacet);
  return capped.length ? capped : undefined;
}
