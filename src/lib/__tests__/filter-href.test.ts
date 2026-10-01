import { describe, expect, it } from "vitest";
import { setParamHref, setParamKeepingPage, toggleMultiHref } from "@/lib/catalog/filter-href";
import { canonicalizeListingQuery, type ListingKind } from "@/lib/catalog/listing-query";
import { CONTENTS, SERIES, STOCK } from "@/lib/catalog/hdc-filters";

const queryOf = (href: string) => (href.includes("?") ? href.slice(href.indexOf("?")) : "");
const isCanonical = (href: string, kind: ListingKind) =>
  canonicalizeListingQuery(kind, queryOf(href)).action === "ok";

describe("filter links are already canonical", () => {
  it("sorts slug multi-values", () => {
    const href = toggleMultiHref("/proionta", { sub: "c,a" }, "sub", "b");
    expect(href).toBe("/proionta?sub=a%2Cb%2Cc");
    expect(isCanonical(href, "products")).toBe(true);
  });

  it("replaces the oldest value at the cap instead of growing past it", () => {
    const href = toggleMultiHref("/proionta", { brand: "a,b,c" }, "brand", "z");
    expect(href).toBe("/proionta?brand=b%2Cc%2Cz");
    expect(isCanonical(href, "products")).toBe(true);
    const search = toggleMultiHref("/anazitisi", { q: "m18", sub: "a,b,c" }, "sub", "d");
    expect(isCanonical(search, "search")).toBe(true);
  });

  it("keeps the HDC enum facets in their own order and drops 'everything'", () => {
    const series = toggleMultiHref("/katalogos/x", { series: "onekey" }, "series", "fuel", SERIES);
    expect(series).toBe("/katalogos/x?series=fuel%2Conekey");
    expect(isCanonical(series, "category")).toBe(true);
    expect(toggleMultiHref("/katalogos/x", { content: "bare" }, "content", "kit", CONTENTS)).toBe(
      "/katalogos/x",
    );
    expect(toggleMultiHref("/katalogos/x", { avail: "in-stock" }, "avail", "order", STOCK)).toBe(
      "/katalogos/x",
    );
  });

  it("does not spell out defaults", () => {
    expect(setParamHref("/brands/m", { perPage: "96" }, "perPage", "24")).toBe("/brands/m");
    expect(setParamHref("/katalogos/x", {}, "sort", "relevance")).toBe("/katalogos/x");
    expect(setParamKeepingPage("/katalogos/x", { page: "1" }, "sort", "newest")).toBe(
      "/katalogos/x?sort=newest",
    );
  });

  it("gives the load-more link a canonical page", () => {
    const href = setParamKeepingPage("/katalogos/x", { platform: "M18", sub: "y" }, "page", "2");
    expect(isCanonical(href, "category")).toBe(true);
  });
});
