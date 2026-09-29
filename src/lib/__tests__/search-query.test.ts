import { describe, expect, it } from "vitest";
import {
  didYouMeanText,
  groupByModel,
  highlightParts,
  normalizeQuery,
  pushRecent,
  queryTokens,
  rankSimilarRoots,
  rootMatches,
  searchWhere,
  type ModelVariantRow,
} from "@/lib/catalog/search-query";
import { searchKey } from "@/lib/greek";

/** Does a stored name match the query the way the database will test it? */
function matches(name: string, query: string): boolean {
  const key = searchKey(name);
  return queryTokens(query).every((alts) => alts.some((alt) => key.includes(alt)));
}

describe("normalizeQuery", () => {
  it("turns a Greek Μ in a model code into a Latin M", () => {
    expect(normalizeQuery("Μ18 FPD2")).toBe("m18 fpd2");
  });
  it("splits a platform glued to its model", () => {
    expect(normalizeQuery("m18fpd3")).toBe("m18 fpd3");
    expect(normalizeQuery("M12FPD2-202X")).toBe("m12 fpd2-202x");
  });
  it("rejoins a split platform", () => {
    expect(normalizeQuery("m 18 fpd3")).toBe("m18 fpd3");
  });
  it("keeps Greek words Greek and drops accents", () => {
    expect(normalizeQuery("Κρουστικό  ΜΠΑΤΑΡΊΑ")).toBe("κρουστικο μπαταρια");
  });
});

describe("queryTokens", () => {
  it("accepts the Greek spelling of a model token", () => {
    expect(queryTokens("Μ18 FPD2")[0]).toEqual(expect.arrayContaining(["m18", "μ18"]));
  });
  it("reads a hyphen inside a model three ways", () => {
    expect(queryTokens("FPD-3")[0]).toEqual(expect.arrayContaining(["fpd-3", "fpd3", "fpd 3"]));
  });
  it("rejoins a short model word and its number", () => {
    expect(queryTokens("fpd 3")).toHaveLength(1);
    expect(queryTokens("fpd 3")[0]).toContain("fpd3");
  });
  it("does not glue Greek words to numbers", () => {
    expect(queryTokens("τρυπανι 8")).toHaveLength(2);
  });
  it("is empty for blank input", () => {
    expect(queryTokens("   ")).toEqual([]);
    expect(searchWhere("  ")).toBeNull();
  });
});

describe("matching (as the database sees it)", () => {
  const chuck = "ΤΣΟΚ Μ18 FPD2 4931479550 MILWAUKEE";
  const glued = "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ  M18FPD3-502X FUEL 4933479860";
  const plain = "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-0X FUEL 4933479859";
  const reversed = "ΔΡΑΠΑΝΟ ΚΡΟΥΣΤΙΚΟ M18 FPD2-502X FUEL 4933464264";

  it("finds the chuck written with a Greek Μ, whichever Μ is typed", () => {
    expect(matches(chuck, "Μ18 FPD2")).toBe(true);
    expect(matches(chuck, "M18 FPD2")).toBe(true);
    expect(matches(chuck, "m18fpd2")).toBe(true);
  });
  it("finds a glued model from a spaced query and vice versa", () => {
    expect(matches(glued, "m18 fpd3")).toBe(true);
    expect(matches(glued, "M18FPD3")).toBe(true);
    expect(matches(plain, "m18fpd3")).toBe(true);
  });
  it("finds FPD3 however the number is attached", () => {
    for (const q of ["fpd3", "FPD-3", "fpd 3", "Fpd3"]) expect(matches(plain, q), q).toBe(true);
    expect(matches(reversed, "fpd 3")).toBe(false);
  });
  it("matches words in any order", () => {
    expect(matches(reversed, "κρουστικό δράπανο")).toBe(true);
    expect(matches(reversed, "δραπανο κρουστικο m18")).toBe(true);
  });
  it("finds nothing for a model that does not exist", () => {
    for (const name of [chuck, glued, plain, reversed]) expect(matches(name, "fpd4")).toBe(false);
  });
});

describe("highlightParts", () => {
  const tokens = queryTokens("fpd");
  it("marks the matched run of a model code", () => {
    expect(highlightParts("M18 FPD3", tokens)).toEqual([
      { text: "M18 ", hit: false },
      { text: "FPD", hit: true },
      { text: "3", hit: false },
    ]);
  });
  it("marks through a Greek lookalike and an accent", () => {
    const parts = highlightParts("ΤΣΟΚ Μ18 FPD2", queryTokens("m18"));
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(["Μ18"]);
    const accented = highlightParts("Κρουστικό δράπανο", queryTokens("κρουστικο"));
    expect(accented[0]).toEqual({ text: "Κρουστικό", hit: true });
  });
});

describe("groupByModel", () => {
  let n = 0;
  const row = (name: string, root: string, over: Partial<ModelVariantRow> = {}): ModelVariantRow => ({
    id: `p${++n}`,
    slug: `s${n}`,
    name,
    sku: `49334${n}`,
    modelRoot: root,
    platform: root.slice(0, 3),
    modelContent: /-0X?\b/.test(name) ? "bare" : "kit",
    image: `/img/${n}.webp`,
    priceNet: 100 * n,
    vatRate: 24,
    inStock: true,
    supplierAvailable: false,
    qty: 3,
    insertedAt: 0,
    ...over,
  });

  // The 14 products «fpd» finds, reduced to those with a model root.
  const rows: ModelVariantRow[] = [
    row("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠ/ΔΟ M12 FPD2-602X FUEL", "M12 FPD2", { inStock: false, insertedAt: 5, priceNet: 293 }),
    row("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ  M18FPD3-502X FUEL", "M18 FPD3", { insertedAt: 3 }),
    row("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠ/ΔΟ ΑΠΟΣ/ΩΝ ΚΕΦΑΛΩΝ M12 FPDX-0  FUEL", "M12 FPDX", { inStock: false }),
    row("ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ ΚΡΟΥΣΤΙΚΟ M12 FPD-0 FUEL", "M12 FPD", { inStock: false }),
    row("ΔΡΑΠΑΝΟ ΚΡΟΥΣΤΙΚΟ M18 FPD2-502X FUEL", "M18 FPD2", { inStock: false }),
    row("ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ ΚΡΟΥΣΤΙΚΟ ΑΠΟΣΠΩΜΕΝΩΝ ΤΣΟΚ M12 FPDXKIT-202X", "M12 FPDXKIT"),
    row("ΕΞΑΓΩΓΕΑΣ ΣΚΟΝΗΣ M18 FPDDEXL-0", "M18 FPDDEXL", { inStock: false }),
    row("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M12 FPD2-202X", "M12 FPD2", { priceNet: 219 }),
    row("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD2-0X FUEL", "M18 FPD2", { inStock: false }),
    row("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M12 FPD2-0", "M12 FPD2"),
    row("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-0X FUEL", "M18 FPD3", { insertedAt: 4 }),
  ];

  const groups = groupByModel(rows, queryTokens("fpd"));

  it("makes one row per model root", () => {
    expect(groups).toHaveLength(7);
    expect(new Set(groups.map((g) => g.root)).size).toBe(7);
  });
  it("puts the model families first: M12 FPD2, M18 FPD3, M18 FPD2", () => {
    expect(groups.slice(0, 3).map((g) => g.root)).toEqual(["M12 FPD2", "M18 FPD3", "M18 FPD2"]);
  });
  it("lists the bare tool first, then the kits by price, with their contents", () => {
    const fpd2 = groups[0];
    expect(fpd2.variants.map((v) => v.content)).toEqual(["bare", "kit", "kit"]);
    expect(fpd2.variants[1].kit).toEqual({ batteries: 2, ah: 2 });
    expect(fpd2.variants[2].kit).toEqual({ batteries: 2, ah: 6 });
  });
  it("prefers the kit's picture and knows the platform tag", () => {
    const fpd3 = groups.find((g) => g.root === "M18 FPD3")!;
    const kit = rows.find((r) => r.name.includes("M18FPD3-502X"))!;
    expect(fpd3.image).toBe(kit.image);
    expect(fpd3.tag).toBe("M18 FUEL");
    expect(groups.find((g) => g.root === "M12 FPD2")!.tag).toBe("M12 FUEL");
  });
  it("says a model is in stock when any variant is", () => {
    expect(groups.find((g) => g.root === "M18 FPD3")!.inStock).toBe(true);
    expect(groups.find((g) => g.root === "M18 FPD2")!.inStock).toBe(false);
  });
  it("says the supplier has a model only when none of its variants is ours", () => {
    const g = groupByModel(
      [
        row("ΔΡΑΠΑΝΟ M18 FPD9-0X FUEL", "M18 FPD9", { inStock: false, supplierAvailable: false }),
        row("ΔΡΑΠΑΝΟ M18 FPD9-502X FUEL", "M18 FPD9", { inStock: false, supplierAvailable: true }),
        row("ΔΡΑΠΑΝΟ M18 FPD8-0X FUEL", "M18 FPD8", { inStock: true, supplierAvailable: false }),
        row("ΔΡΑΠΑΝΟ M18 FPD8-502X FUEL", "M18 FPD8", { inStock: false, supplierAvailable: true }),
        row("ΔΡΑΠΑΝΟ M18 FPD7-0X FUEL", "M18 FPD7", { inStock: false, supplierAvailable: false }),
      ],
      queryTokens("fpd"),
    );
    const of = (root: string) => g.find((x) => x.root === root)!;
    expect(of("M18 FPD9")).toMatchObject({ inStock: false, supplierAvailable: true });
    expect(of("M18 FPD8")).toMatchObject({ inStock: true, supplierAvailable: false });
    expect(of("M18 FPD7")).toMatchObject({ inStock: false, supplierAvailable: false });
  });
  it("ranks a model whose code matches above one found by its description", () => {
    const byWords = groupByModel(rows, queryTokens("fpd3"));
    expect(byWords[0].root).toBe("M18 FPD3");
    expect(rootMatches("M18 FPD3", queryTokens("m18fpd3"))).toBe(true);
    expect(rootMatches("M18 FPD3", queryTokens("κρουστικο"))).toBe(false);
  });
});

describe("did you mean", () => {
  it("compares only the model-like words", () => {
    expect(didYouMeanText("fpd4")).toBe("FPD4");
    expect(didYouMeanText("κρουστικό m18fpd4")).toBe("M18 FPD4");
    expect(didYouMeanText("τρυπάνι")).toBeNull();
  });
  it("offers the closest model families first", () => {
    // pg_trgm similarity() against «FPD4», as the database returns it.
    const rows = [
      { root: "M12 FPD", sim: 0.3, count: 1, inStock: false },
      { root: "M18 FPD3", sim: 0.2727, count: 2, inStock: true },
      { root: "M18 FPD2", sim: 0.2727, count: 2, inStock: false },
      { root: "M12 FPDX", sim: 0.2727, count: 1, inStock: false },
      { root: "M12 FPD2", sim: 0.2727, count: 3, inStock: true },
      { root: "M18 FPDDEXL", sim: 0.2143, count: 1, inStock: false },
      { root: "M18 ONEPD3", sim: 0.15, count: 2, inStock: true },
    ];
    expect(rankSimilarRoots(rows)).toEqual(["M12 FPD2", "M18 FPD3", "M18 FPD2", "M12 FPD"]);
    expect(rankSimilarRoots(rows)).not.toContain("M18 ONEPD3");
  });
});

describe("pushRecent", () => {
  it("keeps the last five, newest first, without duplicates", () => {
    let list: string[] = [];
    for (const q of ["fpd3", "packout", "4932430483", "FPD3", "m12", "m18", "fuel"]) list = pushRecent(list, q);
    expect(list).toEqual(["fuel", "m18", "m12", "FPD3", "4932430483"]);
  });
  it("ignores blank queries", () => {
    expect(pushRecent(["a"], "  ")).toEqual(["a"]);
  });
});
