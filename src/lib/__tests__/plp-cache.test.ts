import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  category: {
    findUnique: vi.fn(async () => ({ id: 1, erpType: "CATEGORY", erpCode: "10" })),
    findMany: vi.fn(async () => []),
  },
  product: {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    groupBy: vi.fn(async () => []),
    aggregate: vi.fn(async () => ({ _min: { priceNet: null }, _max: { priceNet: null } })),
  },
  brand: { findMany: vi.fn(async () => []) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
/* The live campaigns: what `?sale=1` selects. Changed by the tests below. */
const campaigns = vi.hoisted(() => ({ live: null as unknown }));
vi.mock("@/lib/offers/coverage", () => ({ activeCampaignsWhere: async () => campaigns.live }));
// Outside Next there is no incremental cache; the facet cache is not under test.
vi.mock("@/lib/catalog/shared-cache", () => ({
  sharedCatalogue: (_key: string, _seconds: number, fn: unknown) => fn,
}));

const { getPlpData, listingKeyOf, parsePlpParams } = await import("@/lib/catalog/plp");
const { clearListingCache } = await import("@/lib/catalog/listing-cache");

beforeEach(() => {
  clearListingCache();
  db.product.count.mockClear();
});

describe("listing cache key", () => {
  const hdc = { categorySlug: "drapana", grossPrices: true, cumulative: true };
  const key = (raw: Record<string, string>) => listingKeyOf(parsePlpParams(raw, hdc), "el");

  it("is the same for two spellings of one listing", () => {
    expect(key({ sub: "b,a", series: "onekey,fuel" })).toBe(key({ series: "fuel,onekey", sub: "a,b" }));
    expect(key({ sub: "a", page: "1", sort: "relevance" })).toBe(key({ sub: "a" }));
    // Display only, or not read by a load-more listing: never in the key.
    expect(key({ sub: "a", perRow: "5", perPage: "96" })).toBe(key({ sub: "a" }));
  });

  it("differs for what changes the grid", () => {
    expect(key({ sub: "a", page: "2" })).not.toBe(key({ sub: "a" }));
    expect(key({ sub: "a", sort: "price-asc" })).not.toBe(key({ sub: "a" }));
    expect(key({ platform: "M18" })).not.toBe(key({ platform: "M12" }));
    expect(key({ min: "100" })).not.toBe(key({}));
    expect(listingKeyOf(parsePlpParams({}, hdc), "en")).not.toBe(listingKeyOf(parsePlpParams({}, hdc), "el"));
    // Numbered and load-more paging of one scope are different grids.
    expect(listingKeyOf(parsePlpParams({ page: "2" }, { categorySlug: "drapana" }), "el")).not.toBe(
      listingKeyOf(parsePlpParams({ page: "2" }, hdc), "el"),
    );
  });
});

describe("getPlpData", () => {
  const hdc = { categorySlug: "cache-test", grossPrices: true, cumulative: true };

  it("queries the grid once for repeated and concurrent requests of one listing", async () => {
    const params = parsePlpParams({ sub: "a,b", avail: "in-stock" }, hdc);
    await Promise.all([getPlpData(params, "el"), getPlpData(params, "el"), getPlpData(params, "el")]);
    await getPlpData(parsePlpParams({ sub: "b,a", avail: "in-stock" }, hdc), "el");
    expect(db.product.count).toHaveBeenCalledTimes(1);
  });

  it("queries again once the cache is cleared by a catalogue update", async () => {
    const params = parsePlpParams({ platform: "M18" }, hdc);
    await getPlpData(params, "el");
    await getPlpData(params, "el");
    expect(db.product.count).toHaveBeenCalledTimes(1);
    clearListingCache();
    await getPlpData(params, "el");
    expect(db.product.count).toHaveBeenCalledTimes(2);
  });

  it("follows campaigns starting and stopping on ?sale=1, without waiting for the TTL", async () => {
    // The grid query is the one findMany with an orderBy (the facets count separately).
    const gridQueries = () =>
      db.product.findMany.mock.calls.filter((call) => (call as unknown[])[0] && "orderBy" in ((call as unknown[])[0] as object)).length;
    const sale = parsePlpParams({ sale: "1" });
    const before = gridQueries();
    campaigns.live = { id: { in: ["a"] } };
    await getPlpData(sale, "el");
    await getPlpData(sale, "el");
    expect(gridQueries() - before).toBe(1);
    campaigns.live = { id: { in: ["a", "b"] } }; // a second campaign starts
    await getPlpData(sale, "el");
    expect(gridQueries() - before).toBe(2);
    campaigns.live = null; // and both end
    await getPlpData(sale, "el");
    expect(gridQueries() - before).toBe(3);
  });

  it("still 404s an unknown category instead of caching an empty grid", async () => {
    db.category.findUnique.mockResolvedValueOnce(null as never);
    expect(await getPlpData(parsePlpParams({}, { categorySlug: "nope" }), "el")).toBeNull();
  });
});
