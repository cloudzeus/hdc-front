import "server-only";
import { cache } from "react";
import { after } from "next/server";
import { isCostlyListing, type ListingKind } from "@/lib/catalog/listing-query";
import { Semaphore, type SemaphoreStats } from "@/lib/server/semaphore";

/**
 * At most eight costly listings rendering at once, per process.
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 *
 * In the scrape that took the Kolleris shop down on 1/10/2026 (this shop was
 * copied from it), 145 filtered catalogue renders were in flight at once. Each
 * holds its query results, then its React tree, then its RSC payload; together
 * they ran the heap to 2 GB with a fifth of the CPU in GC, and the event loop
 * could no longer answer the health check. More concurrency did not mean more
 * throughput — it meant all of them slow and the process unreachable.
 *
 * With a gate, the ninth costly render (filtered, or deep into load-more —
 * `isCostlyListing`) waits for a slot (up to 2 s) and otherwise gives up
 * before touching the database. Unfiltered pages, product pages, the cart and
 * the health check never queue here.
 *
 * ── Where the slot is held, and streaming ──────────────────────────────────
 *
 * Acquired at the top of the listing body, before any query. Released in
 * `after()`, which runs once the response has finished streaming — so the
 * slot covers the expensive part that comes AFTER the component returns:
 * rendering the product grid and serialising the RSC payload. A 30 s lease
 * frees the slot even if `after()` never runs.
 *
 * The listing bodies render inside a Suspense boundary, so by the time the
 * gate runs the response has already started streaming with status 200: a
 * render cannot turn itself into a 503. A refused render therefore returns a
 * small "busy" view (`ListingBusy`: noindex, retries itself after 5 s) instead
 * of the grid — no queries, no products. The HTTP-level back-pressure with a
 * real status code is the proxy's 429; this gate is what keeps the process
 * alive when the traffic is spread thin enough to pass the per-IP limit.
 *
 * ── Why globalThis ─────────────────────────────────────────────────────────
 *
 * Each listing route is its own server bundle. A module-level instance could
 * exist once per bundle, and five gates of eight are not a gate of eight.
 */

export const LISTING_RENDER_SLOTS = 8;
export const LISTING_RENDER_WAIT_MS = 2_000;
const LEASE_MS = 30_000;

const KEY = Symbol.for("hdc.listingRenderGate");
type GateHolder = { [KEY]?: Semaphore };

function gate(): Semaphore {
  const holder = globalThis as GateHolder;
  holder[KEY] ??= new Semaphore(LISTING_RENDER_SLOTS, LISTING_RENDER_SLOTS * 8);
  return holder[KEY];
}

export function listingRenderStats(): SemaphoreStats {
  return gate().stats();
}

/**
 * The admission itself, ONCE per request: `generateMetadata` and the page body
 * both ask, and React's `cache` is shared between them for one request, so
 * they get the same answer and one slot (released in `after()`). Keyed by a
 * string so the memo works across the two calls' separate param objects.
 */
const admitOnce = cache(async (kind: ListingKind, query: string): Promise<boolean> => {
  if (!isCostlyListing(kind, new URLSearchParams(query))) return true;

  const release = await gate().acquire(LISTING_RENDER_WAIT_MS);
  if (!release) return false;

  const lease = setTimeout(release, LEASE_MS);
  lease.unref?.();
  after(() => {
    clearTimeout(lease);
    release();
  });
  return true;
});

function queryOf(params: Record<string, string | string[] | undefined>): string {
  const pairs: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    for (const v of Array.isArray(value) ? value : [value]) pairs.push([key, v]);
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return new URLSearchParams(pairs).toString();
}

/**
 * True when this render may proceed. Cheap listings always may; a costly one
 * waits for a slot and holds it until the response is done. `params` are the
 * URL's own search params (a platform remembered in a cookie is one of three
 * cached views, not a walk through the facet space).
 */
export async function admitListingRender(
  kind: ListingKind,
  params: Record<string, string | string[] | undefined>,
): Promise<boolean> {
  return admitOnce(kind, queryOf(params));
}

/**
 * `noindex, follow` in the metadata of a render the gate refused, nothing
 * otherwise — for the listing pages' `generateMetadata`.
 *
 * Why not a header: the listing body streams inside Suspense, so the status
 * and headers are already sent when the gate decides; an `X-Robots-Tag`
 * cannot be added any more. The metadata is the robust path: it is decided by
 * the same per-request admission as the body, it lands in `<head>` for the
 * crawlers Next serves blocking metadata to, and in the streamed metadata for
 * the rest. `ListingBusy` also renders its own robots meta tag.
 */
export async function listingBusyMeta(
  kind: ListingKind,
  params: Record<string, string | string[] | undefined>,
): Promise<{ robots: { index: false; follow: true } } | Record<string, never>> {
  return (await admitListingRender(kind, params)) ? {} : { robots: { index: false, follow: true } };
}
