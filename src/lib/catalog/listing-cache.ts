import type { ProductCardData } from "@/lib/catalog/queries";
import { TtlCache } from "@/lib/server/ttl-cache";

/**
 * The listing grids, shared across requests for five minutes.
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 *
 * Facet counts were already cached; the grid was not, so every request for a
 * listing — and every repeat of one — ran its `findMany` and `count` again.
 * Under a facet scrape the same canonical combinations come back from hundreds
 * of addresses. Now a repeat within five minutes is a Map lookup, and fifty
 * concurrent requests for one combination share one query.
 *
 * ── Why in memory and not `unstable_cache` ─────────────────────────────────
 *
 * `unstable_cache` persists every entry to the container's disk with no
 * eviction. Keyed by facet combination and page, that is a disk that fills at
 * the scraper's pace. This cache is bounded twice — 300 entries, and 20.000
 * cards in all, since a load-more page 60 holds 1.440 of them — and lives as
 * long as the process. One per process, on `globalThis`, because each listing
 * route is its own bundle.
 *
 * ── What it may hold ───────────────────────────────────────────────────────
 *
 * Catalogue data only, the same for every visitor: `Product.priceNet`, stock
 * flags, names, images. Campaign prices, favourites, the basket, the compare
 * selection and the account are read per request by the cards and pages and
 * never enter this cache.
 *
 * ── Freshness ──────────────────────────────────────────────────────────────
 *
 * Cleared whenever the HDCtool feed, the delta poll or a sync run writes
 * products (`catalog-sync.ts`), so a price or stock change shows on the next
 * listing view in this process. The five minutes only bound what nothing told
 * this process about (a sync run in another process, a campaign starting).
 */

export type CachedListing = { products: ProductCardData[]; total: number };

const KEY = Symbol.for("hdc.listingCache");
type Holder = { [KEY]?: TtlCache<CachedListing> };

export function listingCache(): TtlCache<CachedListing> {
  const holder = globalThis as Holder;
  holder[KEY] ??= new TtlCache<CachedListing>({
    maxEntries: 300,
    maxWeight: 20_000,
    weigh: (listing) => listing.products.length,
    ttlMs: 300_000,
  });
  return holder[KEY];
}

/** Forget every cached grid: the catalogue just changed. */
export function clearListingCache(): void {
  listingCache().clear();
}
