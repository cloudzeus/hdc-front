import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "@/lib/server/ttl-cache";

function clock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("TtlCache", () => {
  it("serves a repeated key from memory", async () => {
    const cache = new TtlCache<number>({ maxEntries: 10, ttlMs: 300_000 });
    const load = vi.fn(async () => 42);
    expect(await cache.getOrLoad("k", load)).toBe(42);
    expect(await cache.getOrLoad("k", load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("expires entries after the TTL", async () => {
    const c = clock();
    const cache = new TtlCache<number>({ maxEntries: 10, ttlMs: 300_000, now: c.now });
    const load = vi.fn(async () => 1);
    await cache.getOrLoad("k", load);
    c.advance(299_999);
    await cache.getOrLoad("k", load);
    expect(load).toHaveBeenCalledTimes(1);
    c.advance(1);
    await cache.getOrLoad("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one load between concurrent callers", async () => {
    const cache = new TtlCache<number>({ maxEntries: 10, ttlMs: 1_000 });
    let resolve!: (v: number) => void;
    const load = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const all = Promise.all(Array.from({ length: 50 }, () => cache.getOrLoad("k", load)));
    resolve(7);
    expect(await all).toEqual(Array(50).fill(7));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const cache = new TtlCache<number>({ maxEntries: 10, ttlMs: 1_000 });
    await expect(cache.getOrLoad("k", async () => Promise.reject(new Error("db")))).rejects.toThrow("db");
    expect(await cache.getOrLoad("k", async () => 3)).toBe(3);
  });

  it("stays within maxEntries, evicting the least recently used", async () => {
    const cache = new TtlCache<string>({ maxEntries: 2, ttlMs: 1_000 });
    await cache.getOrLoad("a", async () => "a");
    await cache.getOrLoad("b", async () => "b");
    await cache.getOrLoad("a", async () => "a2"); // touch a
    await cache.getOrLoad("c", async () => "c"); // evicts b
    expect(cache.size).toBe(2);
    expect(await cache.getOrLoad("a", async () => "reloaded")).toBe("a");
    expect(await cache.getOrLoad("b", async () => "reloaded")).toBe("reloaded");
  });

  it("clear() empties the cache", async () => {
    const cache = new TtlCache<number>({ maxEntries: 10, ttlMs: 300_000 });
    await cache.getOrLoad("k", async () => 1);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(await cache.getOrLoad("k", async () => 2)).toBe(2);
  });

  it("does not let a load that started before clear() repopulate stale data", async () => {
    const cache = new TtlCache<string>({ maxEntries: 10, ttlMs: 300_000 });
    let finishOld!: (v: string) => void;
    const old = cache.getOrLoad("k", () => new Promise<string>((r) => (finishOld = r)));
    cache.clear();
    // A caller after the clear does not join the stale load.
    const fresh = cache.getOrLoad("k", async () => "new");
    finishOld("old");
    expect(await old).toBe("old");
    expect(await fresh).toBe("new");
    expect(await cache.getOrLoad("k", async () => "again")).toBe("new");
  });

  it("forgets everything on clear, including a load that was in flight", async () => {
    const cache = new TtlCache<string>({ maxEntries: 10, ttlMs: 60_000 });
    await cache.getOrLoad("a", async () => "old");
    let resolve!: (v: string) => void;
    const slow = cache.getOrLoad("b", () => new Promise<string>((r) => (resolve = r)));
    cache.clear();
    expect(cache.size).toBe(0);
    resolve("stale");
    expect(await slow).toBe("stale"); // its own caller still gets an answer…
    expect(await cache.getOrLoad("b", async () => "fresh")).toBe("fresh"); // …but it is not kept
    expect(await cache.getOrLoad("a", async () => "new")).toBe("new");
  });

  it("stays within maxWeight, and does not keep an entry heavier than all of it", async () => {
    const cache = new TtlCache<number[]>({
      maxEntries: 100,
      maxWeight: 10,
      weigh: (v) => v.length,
      ttlMs: 60_000,
    });
    await cache.getOrLoad("a", async () => [1, 2, 3, 4]);
    await cache.getOrLoad("b", async () => [1, 2, 3, 4]);
    await cache.getOrLoad("c", async () => [1, 2, 3, 4]); // evicts a
    expect(cache.size).toBe(2);
    expect(cache.weight).toBe(8);
    await cache.getOrLoad("huge", async () => Array(11).fill(0));
    expect(cache.size).toBe(2);
    expect(await cache.getOrLoad("a", async () => [9])).toEqual([9]);
  });
});
