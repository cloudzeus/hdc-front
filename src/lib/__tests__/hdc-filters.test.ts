import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  contentCounts,
  grossToNet,
  hdcFilterClauses,
  parseAvail,
  parseContent,
  parsePlatform,
  parseSeries,
  platformCounts,
  platformsPresent,
  seriesCounts,
  stockClause,
} from "@/lib/catalog/hdc-filters";
import { toggleMultiHref } from "@/lib/catalog/filter-href";
import { findMilwaukeeImage, flattenMilwaukeeTree } from "@/lib/catalog/milwaukee-categories";

const c = (n: number) => ({ _count: { _all: n } });

describe("HDC filter parsing", () => {
  it("reads one platform, case-insensitively, and ignores anything else", () => {
    expect(parsePlatform("M18")).toBe("M18");
    expect(parsePlatform("mx")).toBe("MX");
    expect(parsePlatform(["m12", "M18"])).toBe("M12");
    expect(parsePlatform("M28")).toBeUndefined();
    expect(parsePlatform(undefined)).toBeUndefined();
  });

  it("reads content and series lists in a canonical order", () => {
    expect(parseContent("kit")).toEqual(["kit"]);
    expect(parseSeries("onekey,fuel")).toEqual(["fuel", "onekey"]);
    expect(parseSeries(["basic", "junk"])).toEqual(["basic"]);
    expect(parseSeries("junk")).toBeUndefined();
  });

  it("treats every box ticked as no filter", () => {
    expect(parseContent("bare,kit")).toBeUndefined();
    expect(parseSeries("fuel,onekey,basic")).toBeUndefined();
    expect(parseAvail("in-stock,order")).toBe("all");
  });

  it("reads availability as in stock, on order, or all", () => {
    expect(parseAvail("in-stock")).toBe("in-stock");
    expect(parseAvail("order")).toBe("order");
    expect(parseAvail(undefined)).toBe("all");
  });
});

describe("stockClause", () => {
  it("«Διαθέσιμα» is ours or the supplier's", () => {
    expect(stockClause("in-stock")).toEqual({ OR: [{ inStock: true }, { supplierAvailable: true }] });
  });
  it("«Παράδοση 1–3 εργάσιμες» is neither", () => {
    expect(stockClause("order")).toEqual({ inStock: false, supplierAvailable: false });
  });
  it("no filter", () => {
    expect(stockClause("all")).toBeNull();
  });
});

describe("HDC where clauses", () => {
  const params = { platform: "M18" as const, content: ["kit" as const], series: ["fuel" as const, "basic" as const] };

  it("filters by the derived columns", () => {
    expect(hdcFilterClauses(params)).toEqual([
      { platform: "M18" },
      { modelContent: { in: ["kit"] } },
      { OR: [{ isFuel: true }, { isFuel: false, isOneKey: false }] },
    ]);
  });

  it("leaves out the group being counted", () => {
    expect(hdcFilterClauses(params, "platform")).not.toContainEqual({ platform: "M18" });
    expect(hdcFilterClauses(params, "series")).toHaveLength(2);
    expect(hdcFilterClauses({ series: ["onekey"] })).toEqual([{ isOneKey: true }]);
    expect(hdcFilterClauses({})).toEqual([]);
  });
});

describe("HDC facet counts", () => {
  it("counts platforms, keeping the products without one in the total", () => {
    const counts = platformCounts([
      { platform: "M18", ...c(252) },
      { platform: "M12", ...c(118) },
      { platform: null, ...c(31) },
      { platform: "MX", ...c(11) },
    ]);
    expect(counts).toEqual({ all: 412, M12: 118, M18: 252, MX: 11 });
    expect(platformsPresent(counts)).toEqual(["M12", "M18", "MX"]);
    expect(platformsPresent({ all: 5, M12: 0, M18: 5, MX: 0 })).toEqual(["M18"]);
  });

  it("counts bare tools and kits, ignoring products with neither", () => {
    expect(
      contentCounts([
        { modelContent: "bare", ...c(3) },
        { modelContent: "kit", ...c(4) },
        { modelContent: null, ...c(9) },
      ]),
    ).toEqual({ bare: 3, kit: 4 });
  });

  it("counts FUEL and ONE-KEY independently, and the core range as neither", () => {
    expect(
      seriesCounts([
        { isFuel: true, isOneKey: true, ...c(2) },
        { isFuel: true, isOneKey: false, ...c(5) },
        { isFuel: false, isOneKey: true, ...c(1) },
        { isFuel: false, isOneKey: false, ...c(7) },
      ]),
    ).toEqual({ fuel: 7, onekey: 3, basic: 7 });
  });

  it("counts the active filters for the phone bar", () => {
    expect(activeFilterCount({})).toBe(0);
    expect(
      activeFilterCount({ platform: "M18", series: "fuel,onekey", avail: "in-stock", min: "100", sub: "a,b" }),
    ).toBe(7);
    expect(activeFilterCount({ platform: "M99", avail: "in-stock,order" })).toBe(0);
  });

  it("turns the URL's gross euros into the net price the catalogue filters on", () => {
    expect(grossToNet(124, 24)).toBe(100);
    expect(grossToNet(400, 24)).toBe(322.58);
  });
});

describe("filter links", () => {
  it("drops a group's param when every box ends up ticked", () => {
    expect(toggleMultiHref("/k", { avail: "in-stock" }, "avail", "order", ["in-stock", "order"])).toBe("/k");
    expect(toggleMultiHref("/k", { series: "onekey", page: "3" }, "series", "fuel", ["fuel", "onekey", "basic"])).toBe(
      "/k?series=fuel%2Conekey",
    );
    expect(toggleMultiHref("/k", { content: "kit" }, "content", "kit", ["bare", "kit"])).toBe("/k");
  });
});

describe("Milwaukee category photo", () => {
  const tree = flattenMilwaukeeTree([
    {
      id: "a",
      parentId: null,
      erpType: "CATEGORY",
      erpCode: "12",
      name: { el: "ΕΡΓΑΛΕΙΑ ΜΠΑΤΑΡΙΑΣ", en: "", it: "" },
      order: 0,
      mainImage: "https://cdn/battery.webp",
      children: [
        {
          id: "b",
          parentId: "a",
          erpType: "GROUP",
          erpCode: "1201",
          name: { el: "Δράπανα", en: "", it: "" },
          order: 0,
          mainImage: "https://cdn/drills.webp",
          children: [],
        },
      ],
    },
  ]);

  it("matches by Greek name, ignoring case and accents, at any depth", () => {
    expect(findMilwaukeeImage(tree, { nameEl: "Εργαλεία μπαταρίας", erpType: "CATEGORY", erpCode: "99" })).toBe(
      "https://cdn/battery.webp",
    );
    expect(findMilwaukeeImage(tree, { nameEl: "ΔΡΑΠΑΝΑ", erpType: "GROUP", erpCode: "0" })).toBe("https://cdn/drills.webp");
  });

  it("falls back to the ERP code, and to nothing", () => {
    expect(findMilwaukeeImage(tree, { nameEl: "Άλλο όνομα", erpType: "GROUP", erpCode: "1201" })).toBe(
      "https://cdn/drills.webp",
    );
    expect(findMilwaukeeImage(tree, { nameEl: "Άγνωστο", erpType: "GROUP", erpCode: "7" })).toBeNull();
  });
});
