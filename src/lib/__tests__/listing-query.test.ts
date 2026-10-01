import { describe, expect, it } from "vitest";
import {
  LISTING_LIMITS,
  canonicalizeListingQuery,
  capFacetValues,
  ceilPrice,
  filteredListingMeta,
  floorPrice,
  isCostlyListing,
  isFilteredListing,
  isPassThroughParam,
  listingKindOf,
  listingLinkRel,
  toggleCappedValue,
  trimToFacetCap,
} from "@/lib/catalog/listing-query";

type Kind = Parameters<typeof canonicalizeListingQuery>[0];
const canon = (search: string, kind: Kind = "category") => canonicalizeListingQuery(kind, search);
const redirect = (search: string, perRow: number | null = null) => ({
  action: "redirect",
  search,
  perRow,
});

describe("listingKindOf", () => {
  it.each([
    ["/katalogos/drapana", "category"],
    ["/en/katalogos/drapana", "category"],
    ["/katalogos/drapana/", "category"],
    ["/it/brands/milwaukee", "brand"],
    ["/proionta", "products"],
    ["/en/prosfores/summer", "offers"],
    ["/anazitisi", "search"],
    ["/it/anazitisi", "search"],
  ] as const)("%s is a %s listing", (path, kind) => {
    expect(listingKindOf(path)).toBe(kind);
  });

  it.each(["/katalogos", "/katalogos/a/b", "/proion/x", "/", "/en", "/enkatalogos/x", "/prosfores", "/brands"])(
    "%s is not a listing",
    (path) => expect(listingKindOf(path)).toBeNull(),
  );
});

describe("canonicalizeListingQuery: shared rules", () => {
  it("leaves a bare listing and its paging alone", () => {
    expect(canon("")).toEqual({ action: "ok" });
    expect(canon("?page=3")).toEqual({ action: "ok" });
    expect(canon("?page=3", "brand")).toEqual({ action: "ok" });
  });

  it("keeps attribution and router params untouched", () => {
    expect(canon("?utm_source=google&gclid=abc&sub=a")).toEqual({ action: "ok" });
    expect(canon("?utm_whatever=x&fbclid=1&srsltid=2")).toEqual({ action: "ok" });
    expect(canon("?_rsc=1x2y&sub=a")).toEqual({ action: "ok" });
    expect(
      canon(
        "?gbraid=1&wbraid=2&msclkid=3&mc_cid=4&mc_eid=5&_kx=6&ttclid=7&twclid=8&li_fat_id=9" +
          "&dclid=10&yclid=11&igshid=12&_hsenc=13&_hsmi=14&gclsrc=15",
      ),
    ).toEqual({ action: "ok" });
    expect(isPassThroughParam("utm_anything_new")).toBe(true);
    for (const key of ["_ga", "_gl", "irclickid", "awc", "cjevent", "pk_campaign", "pk_kwd", "mtm_source", "matomo_campaign"]) {
      expect(isPassThroughParam(key), key).toBe(true);
    }
    expect(canon("?sub=a&irclickid=1&awc=2&cjevent=3&pk_source=x&mtm_medium=y&_ga=z")).toEqual({ action: "ok" });
    expect(isPassThroughParam("foo")).toBe(false);
  });

  it("drops unknown params through a redirect", () => {
    expect(canon("?sub=a&foo=1&x=y")).toEqual(redirect("?sub=a"));
  });

  it("drops defaults", () => {
    expect(canon("?page=1&sort=relevance")).toEqual(redirect(""));
    expect(canon("?page=1&perPage=24&sort=relevance", "brand")).toEqual(redirect(""));
  });

  it("validates sort", () => {
    expect(canon("?sort=price-asc")).toEqual({ action: "ok" });
    expect(canon("?sort=evil")).toEqual(redirect(""));
  });

  it("clamps a page past anything real instead of refusing it, and drops a malformed one", () => {
    expect(canon("?page=400", "brand")).toEqual({ action: "ok" });
    expect(canon("?page=401", "brand")).toEqual(redirect("?page=400"));
    expect(canon("?page=99999", "offers")).toEqual(redirect("?page=400"));
    expect(canon("?page=abc")).toEqual(redirect(""));
    expect(canon("?page=0")).toEqual(redirect(""));
  });

  it("drops slugs that are not slugs", () => {
    expect(canon("?sub=a,<script>,b", "brand")).toEqual(redirect("?sub=a,b"));
    expect(canon(`?brand=${"x".repeat(200)}`, "products")).toEqual(redirect(""));
  });

  it("is idempotent on every redirect it gives", () => {
    const inputs: Array<[string, Kind]> = [
      ["?sub=d,a,c,b&brand=z,x,y&min=13&max=877&perPage=96&perRow=5&avail=in-stock", "products"],
      ["?platform=m18&series=onekey,fuel&content=kit,bare&avail=order,in-stock&min=137&max=1234", "category"],
      ["?q=drill&cat=x&sub=c,b,a,d&min=95&max=104&page=75", "search"],
      ["?min=900&max=120", "category"],
      [`?q=${"x".repeat(300)}&page=99999`, "search"],
      ["?sub=a,b,c,d&brand=w,x,y,z&min=50&max=150&avail=in-stock&sale=1&new=1&perPage=48", "offers"],
    ];
    for (const [search, kind] of inputs) {
      const first = canon(search, kind);
      expect(first.action).toBe("redirect");
      if (first.action !== "redirect") continue;
      expect(canon(first.search, kind)).toEqual({ action: "ok" });
    }
  });
});

describe("canonicalizeListingQuery: classic listings (brand, products, offers)", () => {
  it("accepts canonical facet URLs without a redirect, in any key order", () => {
    expect(canon("?sub=a,b&brand=x&avail=in-stock", "products")).toEqual({ action: "ok" });
    expect(canon("?brand=x&sub=a", "offers")).toEqual({ action: "ok" });
    // `%2C` and `,` are the same value: no redirect for an encoding difference.
    expect(canon("?sub=a%2Cb", "products")).toEqual({ action: "ok" });
  });

  it("sorts and dedupes multi-values", () => {
    expect(canon("?sub=b,a", "products")).toEqual(redirect("?sub=a,b"));
    expect(canon("?sub=a&sub=b,a", "products")).toEqual(redirect("?sub=a,b"));
  });

  it("trims a facet past the per-facet cap", () => {
    expect(canon("?sub=d,c,b,a&brand=x", "products")).toEqual(redirect("?sub=a,b,c&brand=x"));
    expect(LISTING_LIMITS.maxValuesPerFacet).toBe(3);
  });

  it("accepts everything the filters can produce together", () => {
    // 3 categories + 3 brands + a price band + availability + sale + new.
    expect(
      canon("?sub=a,b,c&brand=x,y,z&min=50&max=150&avail=in-stock&sale=1&new=1", "products"),
    ).toEqual({ action: "ok" });
    expect(LISTING_LIMITS.maxFacetValues).toBe(10);
  });

  it("drops params the listing kind does not read", () => {
    // A brand page is already one brand.
    expect(canon("?brand=x&sub=a", "brand")).toEqual(redirect("?sub=a"));
    // The Milwaukee filters belong to the HDC listings.
    expect(canon("?platform=M18&sub=a", "products")).toEqual(redirect("?sub=a"));
  });

  it("only allows the real perPage options", () => {
    expect(canon("?perPage=96", "brand")).toEqual({ action: "ok" });
    expect(canon("?perPage=48", "offers")).toEqual({ action: "ok" });
    expect(canon("?perPage=500", "brand")).toEqual(redirect(""));
  });

  it("moves perRow out of the URL into a preference", () => {
    expect(canon("?sub=a&perRow=3", "products")).toEqual(redirect("?sub=a", 3));
    expect(canon("?perRow=9", "brand")).toEqual(redirect(""));
  });

  it("only allows the price bands the filter offers", () => {
    expect(canon("?min=50&max=150", "brand")).toEqual({ action: "ok" });
    expect(canon("?max=50", "brand")).toEqual({ action: "ok" });
    expect(canon("?min=500", "brand")).toEqual({ action: "ok" });
    expect(canon("?min=37&max=912", "brand")).toEqual(redirect(""));
    expect(canon("?min=abc", "brand")).toEqual(redirect(""));
    expect(canon("?min=50.00&max=150", "brand")).toEqual(redirect("?min=50&max=150"));
  });

  it("validates single-value facets", () => {
    expect(canon("?avail=in-stock&sale=1&new=1", "products")).toEqual({ action: "ok" });
    expect(canon("?avail=all&sale=yes&new=0", "products")).toEqual(redirect(""));
  });

  it("canonicalises the scraper URL in one hop", () => {
    expect(
      canon("?sub=d,a,c,b&brand=z,x,y&min=13&max=877&perPage=96&perRow=5&avail=in-stock", "products"),
    ).toEqual(redirect("?sub=a,b,c&brand=x,y,z&perPage=96&avail=in-stock", 5));
  });
});

describe("canonicalizeListingQuery: HDC listings (category, search)", () => {
  it("accepts what the HDC filters emit", () => {
    expect(canon("?platform=M18&avail=in-stock&content=bare&series=fuel,onekey&sub=x")).toEqual({
      action: "ok",
    });
    expect(canon("?platform=all")).toEqual({ action: "ok" });
    expect(canon("?avail=order&page=2")).toEqual({ action: "ok" });
  });

  it("keeps platform=all: it overrides the remembered platform", () => {
    expect(canon("?platform=all&sub=x")).toEqual({ action: "ok" });
    expect(canon("?platform=ALL")).toEqual(redirect("?platform=all"));
  });

  it("spells the platform one way and drops an unknown one", () => {
    expect(canon("?platform=m18")).toEqual(redirect("?platform=M18"));
    expect(canon("?platform=M99")).toEqual(redirect(""));
  });

  it("orders enum facets as the filters list them and collapses 'everything'", () => {
    expect(canon("?series=onekey,fuel")).toEqual(redirect("?series=fuel,onekey"));
    expect(canon("?series=fuel,onekey,basic")).toEqual(redirect(""));
    expect(canon("?content=kit,bare")).toEqual(redirect(""));
    expect(canon("?avail=order,in-stock")).toEqual(redirect(""));
    expect(canon("?content=KIT")).toEqual(redirect("?content=kit"));
    expect(canon("?series=nonsense")).toEqual(redirect(""));
  });

  it("drops the classic-only params", () => {
    expect(canon("?brand=x&sale=1&new=1&perPage=96&sub=a")).toEqual(redirect("?sub=a"));
  });

  it("drops perRow without a preference (the HDC grid has no density control)", () => {
    expect(canon("?perRow=3&sub=a")).toEqual(redirect("?sub=a"));
  });

  it("keeps a free price range, rounded outwards to a coarse step", () => {
    expect(canon("?min=90&max=150")).toEqual({ action: "ok" });
    expect(canon("?min=95&max=104")).toEqual(redirect("?min=90&max=150"));
    expect(canon("?min=137&max=1234")).toEqual(redirect("?min=100&max=1300"));
    expect(canon("?min=12.5")).toEqual(redirect("?min=10"));
    expect(canon("?max=7")).toEqual(redirect("?max=10"));
  });

  it("drops a price bound that filters nothing or is not a number", () => {
    expect(canon("?min=0&max=200")).toEqual(redirect("?max=200"));
    expect(canon("?min=4")).toEqual(redirect(""));
    expect(canon("?min=abc&max=-5")).toEqual(redirect(""));
    expect(canon(`?max=${"9".repeat(12)}`)).toEqual(redirect(""));
  });

  it("swaps a reversed range and clamps an absurd one", () => {
    expect(canon("?min=900&max=120")).toEqual(redirect("?min=100&max=900"));
    expect(canon("?min=250000")).toEqual(redirect("?min=100000"));
  });

  it("caps load-more paging at the pages one request will draw", () => {
    expect(canon("?page=60")).toEqual({ action: "ok" });
    expect(canon("?page=75")).toEqual(redirect("?page=60"));
    expect(canon("?page=99999")).toEqual(redirect("?page=60"));
    // The classic listings page normally.
    expect(canon("?page=75", "brand")).toEqual({ action: "ok" });
  });

  it("accepts everything the HDC filters can produce together", () => {
    // Search: 3 categories + platform + availability + content + 2 series + price = 9.
    expect(
      canon("?q=m18&platform=M18&avail=in-stock&content=bare&series=fuel,onekey&sub=x,y,z&min=100", "search"),
    ).toEqual({ action: "ok" });
  });

  it("handles search: q and cat are allowed, an over-long q is cut to 200 characters", () => {
    expect(canon("?q=drill&cat=drapana&platform=M12", "search")).toEqual({ action: "ok" });
    expect(canon("?q=%CE%B4%CF%81%CE%B1%CF%80%CE%AC%CE%BD%CE%BF", "search")).toEqual({ action: "ok" });
    expect(canon(`?q=${"a".repeat(200)}`, "search")).toEqual({ action: "ok" });
    expect(canon(`?q=${"a".repeat(500)}&platform=M18`, "search")).toEqual(
      redirect(`?q=${"a".repeat(200)}&platform=M18`),
    );
    const greek = canon(`?q=${encodeURIComponent("δ".repeat(250))}`, "search");
    expect(greek).toEqual(redirect(`?q=${encodeURIComponent("δ".repeat(200))}`));
    expect(canon("?q=drill&cat=<x>", "search")).toEqual(redirect("?q=drill"));
    expect(canon("?q=drill", "category")).toEqual(redirect(""));
  });
});

describe("price grid", () => {
  it("floors and ceils onto 10 / 50 / 100 / 1000 € steps", () => {
    expect(floorPrice(95)).toBe(90);
    expect(ceilPrice(95)).toBe(100);
    expect(floorPrice(137)).toBe(100);
    expect(ceilPrice(137)).toBe(150);
    expect(floorPrice(1234)).toBe(1200);
    expect(ceilPrice(1234)).toBe(1300);
    expect(floorPrice(12_345)).toBe(12_000);
    expect(ceilPrice(12_345)).toBe(13_000);
  });

  it("leaves grid points where they are", () => {
    for (const v of [0, 10, 90, 100, 150, 950, 1000, 1100, 9900, 10_000, 11_000]) {
      expect(floorPrice(v)).toBe(v);
      expect(ceilPrice(v)).toBe(v);
    }
  });
});

describe("isFilteredListing", () => {
  it("treats paging and pass-through params as unfiltered", () => {
    expect(isFilteredListing(new URLSearchParams(""))).toBe(false);
    expect(isFilteredListing(new URLSearchParams("page=2&utm_source=x&_rsc=1"))).toBe(false);
    expect(isFilteredListing({ page: "2", sub: undefined })).toBe(false);
  });

  it("treats any facet or view param as filtered", () => {
    expect(isFilteredListing(new URLSearchParams("sub=a"))).toBe(true);
    expect(isFilteredListing({ sort: "price-asc" })).toBe(true);
    expect(isFilteredListing({ platform: "M18", series: "fuel" })).toBe(true);
    expect(isFilteredListing({ platform: "bogus" })).toBe(true);
    expect(isFilteredListing(new URLSearchParams("foo=1"))).toBe(true);
  });
});

describe("platform landings", () => {
  // «M18 δραπανοκατσάβιδα»: a lone ?platform= (with or without paging) is a
  // landing page, as it was before the facet rules — not a filtered view.
  it("are not filtered views", () => {
    expect(isFilteredListing({ platform: "M18" })).toBe(false);
    expect(isFilteredListing({ platform: ["M12"], page: "2", utm_source: "x" })).toBe(false);
    expect(isFilteredListing(new URLSearchParams("page=3&platform=MX"))).toBe(false);
    expect(isFilteredListing({ platform: "all" })).toBe(false);
  });

  it("keep their indexable metadata", () => {
    expect(filteredListingMeta({ platform: "M18" })).toEqual({});
    expect(filteredListingMeta({ platform: "M18", page: "2" })).toEqual({});
    expect(filteredListingMeta({ platform: "M18", content: "kit" })).toEqual({
      robots: { index: false, follow: true },
    });
  });

  it("are linked without nofollow; multi-facet views with it", () => {
    expect(listingLinkRel("/katalogos/x?platform=M18")).toBeUndefined();
    expect(listingLinkRel("/katalogos/x?platform=M18&page=2")).toBeUndefined();
    expect(listingLinkRel("/katalogos/x")).toBeUndefined();
    expect(listingLinkRel("/katalogos/x?platform=M18&series=fuel")).toBe("nofollow");
    expect(listingLinkRel("/katalogos/x?sub=a")).toBe("nofollow");
  });

  it("cost like an unfiltered listing until deep into load-more", () => {
    expect(isCostlyListing("category", { platform: "M18", page: "2" })).toBe(false);
    expect(isCostlyListing("category", { platform: "M18", page: "6" })).toBe(true);
  });
});

describe("isCostlyListing", () => {
  it("adds deep load-more pages of the HDC listings to the filtered ones", () => {
    expect(isCostlyListing("category", { page: "2" })).toBe(false);
    expect(isCostlyListing("category", { page: "5" })).toBe(true);
    expect(isCostlyListing("search", new URLSearchParams("page=12"))).toBe(true);
    expect(isCostlyListing("brand", { page: "12" })).toBe(false);
    expect(isCostlyListing("brand", { sub: "a" })).toBe(true);
  });
});

describe("trimToFacetCap", () => {
  it("leaves a query within the cap alone", () => {
    const pairs: Array<[string, string]> = [["sub", "a,b"], ["sort", "newest"], ["min", "50"]];
    expect(trimToFacetCap(pairs)).toEqual(pairs);
  });

  it("trims a legacy over-cap query in priority order, toggles first", () => {
    expect(
      trimToFacetCap([
        ["new", "1"],
        ["sub", "a,b,c"],
        ["brand", "x,y,z"],
        ["avail", "in-stock"],
        ["platform", "M18"],
        ["series", "fuel,onekey"],
        ["min", "50"],
        ["sale", "1"],
        ["page", "2"],
      ]),
    ).toEqual([
      ["sub", "a,b,c"],
      ["brand", "x,y,z"],
      ["avail", "in-stock"],
      ["platform", "M18"],
      ["series", "fuel,onekey"],
      ["page", "2"],
    ]);
  });
});

describe("toggleCappedValue", () => {
  it("adds and removes, sorted", () => {
    expect(toggleCappedValue(["b"], "a")).toEqual(["a", "b"]);
    expect(toggleCappedValue(["a", "b"], "a")).toEqual(["b"]);
  });

  it("keeps the new value when the cap is reached", () => {
    expect(toggleCappedValue(["a", "b", "c"], "z")).toEqual(["b", "c", "z"]);
  });
});

describe("capFacetValues", () => {
  it("dedupes, sorts and caps", () => {
    expect(capFacetValues(["d", "c", "b", "a", "a"])).toEqual(["a", "b", "c"]);
    expect(capFacetValues([])).toBeUndefined();
    expect(capFacetValues(undefined)).toBeUndefined();
  });
});

describe("filteredListingMeta", () => {
  it("noindexes filtered views and leaves bare listings and paging alone", () => {
    expect(filteredListingMeta({ sub: "a" })).toEqual({ robots: { index: false, follow: true } });
    expect(filteredListingMeta({ page: "2" })).toEqual({});
    expect(filteredListingMeta({})).toEqual({});
  });
});
