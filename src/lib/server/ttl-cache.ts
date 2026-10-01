/**
 * A small in-process cache: least-recently-used, time-limited, single-flight.
 *
 * Pure, so it can be tested on its own; `listing-cache.ts` uses it for the
 * listing grids.
 *
 *   - bounded by entry count, and optionally by a weight (cards, say), so a
 *     scraper walking combinations evicts old entries instead of growing the
 *     heap;
 *   - entries expire after `ttlMs`;
 *   - concurrent callers for the same key share ONE load. Under a burst of
 *     identical requests that is the difference between one query and fifty;
 *   - a failed load is not cached; the next caller tries again;
 *   - `clear()` forgets everything, and a load already in flight when it is
 *     called answers its own callers but is not kept.
 */

type Entry<V> = { value: V; expires: number; weight: number };

export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly inflight = new Map<string, Promise<V>>();
  private readonly maxEntries: number;
  private readonly maxWeight: number;
  private readonly weigh: (value: V) => number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private totalWeight = 0;
  private generation = 0;

  constructor(options: {
    maxEntries: number;
    ttlMs: number;
    maxWeight?: number;
    weigh?: (value: V) => number;
    now?: () => number;
  }) {
    this.maxEntries = options.maxEntries;
    this.maxWeight = options.maxWeight ?? Number.POSITIVE_INFINITY;
    this.weigh = options.weigh ?? (() => 0);
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  get weight(): number {
    return this.totalWeight;
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
    this.totalWeight = 0;
    this.generation++;
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.totalWeight -= entry.weight;
  }

  private store(key: string, value: V): void {
    const weight = this.weigh(value);
    if (weight > this.maxWeight) return;
    this.remove(key);
    this.entries.set(key, { value, expires: this.now() + this.ttlMs, weight });
    this.totalWeight += weight;
    while (this.entries.size > this.maxEntries || this.totalWeight > this.maxWeight) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
  }

  async getOrLoad(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      if (hit.expires > this.now()) {
        this.entries.set(key, hit); // most recently used
        return hit.value;
      }
      this.totalWeight -= hit.weight;
    }

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const generation = this.generation;
    const promise = load().then(
      (value) => {
        if (this.inflight.get(key) === promise) this.inflight.delete(key);
        // Cleared while loading: the value may predate the change that cleared it.
        if (generation === this.generation) this.store(key, value);
        return value;
      },
      (error: unknown) => {
        if (this.inflight.get(key) === promise) this.inflight.delete(key);
        throw error;
      },
    );
    this.inflight.set(key, promise);
    return promise;
  }
}
