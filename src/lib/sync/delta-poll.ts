import "server-only";
import { prisma } from "@/lib/prisma";
import { hdctool } from "@/lib/hdctool/client";
import { syncProductsByMtrl } from "@/lib/sync/catalog-sync";

/**
 * Pull what changed in HDCtool since the last pass.
 *
 * The Kolleris eshop is told about changes by webhook. HDCtool can only push
 * to one shop today (spec H1), so this shop asks instead: every five minutes,
 * `catalog/delta` "changed since my cursor". The answer covers every brand;
 * `syncProductsByMtrl` writes only Milwaukee (`isShopProduct`).
 *
 * The cursor is HDCtool's own `upTo`, and moves only after every page was
 * read and written within budget — a pass that runs out of pages, or fails
 * outright, leaves the cursor where it was, and the next pass asks again
 * from the same `since`. Ids already fetched in an incomplete pass are still
 * written (`syncProductsByMtrl` is idempotent), only the cursor is withheld.
 */

const CHANNEL = "catalog-delta-poll";
/** First run, or a cursor lost: look back this far. The nightly reconcile covers the rest. */
const FIRST_LOOKBACK_MS = 60 * 60_000;
const MAX_PAGES = 20;

export type DeltaPollResult = {
  since: string;
  upTo: string | null;
  changed: number;
  written: number;
  /** False when MAX_PAGES ran out before HDCtool ran out of pages — the cursor was not advanced. */
  complete: boolean;
};

export async function pollCatalogDelta(): Promise<DeltaPollResult> {
  const state = await prisma.syncState.findUnique({ where: { channel: CHANNEL } });
  const since = state?.cursor ?? new Date(Date.now() - FIRST_LOOKBACK_MS).toISOString();

  const ids = new Set<number>();
  let upTo: string | null = null;
  let afterMtrl: number | undefined;
  // Only true once a page comes back with no further cursor — i.e. every
  // page of this pass was actually read, not merely attempted.
  let complete = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await hdctool.catalogDelta({ op: "changed", since, afterMtrl });
    // The first page's upTo is the earliest of the pass — the safe one to resume from.
    upTo ??= response.upTo ?? null;
    for (const id of response.mtrl) ids.add(id);
    if (response.nextAfterMtrl == null) {
      complete = true;
      break;
    }
    afterMtrl = response.nextAfterMtrl;
  }

  const result = ids.size > 0 ? await syncProductsByMtrl([...ids]) : null;

  // The cursor advances only for a pass that actually finished. MAX_PAGES
  // exhausted with more pages still pending means this pass saw only part of
  // "changed since `since`" — moving the cursor to `upTo` would silently drop
  // whatever page 21+ would have contained. Leaving it means the next run
  // asks the same "since" again; already-written ids cost nothing to redo.
  if (complete && upTo) {
    await prisma.syncState.upsert({
      where: { channel: CHANNEL },
      create: { channel: CHANNEL, cursor: upTo, lastRunAt: new Date(), lastSuccessAt: new Date() },
      update: { cursor: upTo, lastRunAt: new Date(), lastSuccessAt: new Date() },
    });
  } else {
    await prisma.syncState.upsert({
      where: { channel: CHANNEL },
      create: { channel: CHANNEL, lastRunAt: new Date() },
      update: { lastRunAt: new Date() },
    });
  }

  return { since, upTo, changed: ids.size, written: result?.processed ?? 0, complete };
}
