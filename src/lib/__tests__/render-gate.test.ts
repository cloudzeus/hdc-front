import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* `after()` needs a request scope; here it only records the callbacks so the
   test can run them as "the response has finished streaming". */
const afterCallbacks: Array<() => void> = [];
vi.mock("next/server", () => ({ after: (fn: () => void) => afterCallbacks.push(fn) }));

const { LISTING_RENDER_SLOTS, admitListingRender, listingRenderStats } = await import(
  "@/lib/server/render-gate"
);

function finishResponses() {
  while (afterCallbacks.length) afterCallbacks.shift()!();
}

beforeEach(() => finishResponses());
afterEach(() => {
  finishResponses();
  vi.useRealTimers();
});

describe("admitListingRender", () => {
  it("never queues an unfiltered listing or a shallow load-more page", async () => {
    for (let i = 0; i < LISTING_RENDER_SLOTS * 3; i++) {
      expect(await admitListingRender("category", {})).toBe(true);
      expect(await admitListingRender("category", { page: "2", utm_source: "x" })).toBe(true);
    }
    expect(listingRenderStats().active).toBe(0);
  });

  it("holds a slot per filtered render until the response is done", async () => {
    expect(await admitListingRender("category", { platform: "M18" })).toBe(true);
    expect(await admitListingRender("search", { q: "m18" })).toBe(true);
    expect(listingRenderStats().active).toBe(2);
    finishResponses();
    expect(listingRenderStats().active).toBe(0);
  });

  it("treats a deep load-more page as costly", async () => {
    expect(await admitListingRender("category", { page: "12" })).toBe(true);
    expect(listingRenderStats().active).toBe(1);
  });

  it("gives up after 2 s when every slot is busy, and admits again once one frees", async () => {
    vi.useFakeTimers();
    for (let i = 0; i < LISTING_RENDER_SLOTS; i++) {
      expect(await admitListingRender("brand", { sub: `s${i}` })).toBe(true);
    }
    const waiting = admitListingRender("brand", { sub: "late" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await waiting).toBe(false);

    afterCallbacks.shift()!();
    expect(await admitListingRender("brand", { sub: "next" })).toBe(true);
  });
});
