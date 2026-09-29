import { describe, expect, it } from "vitest";
import {
  compareSizeLabels,
  onePerFamily,
  planSizeFamilies,
  sizeDisplayLabel,
  sizeFamilyKey,
  stripSizeToken,
  type FamilyRow,
} from "@/lib/catalog/size-family";
import { nameWithoutSize } from "@/lib/catalog/variant-name";

const row = (
  id: string,
  name: string,
  mpn: string,
  labels: string[],
  extra: Partial<FamilyRow> = {},
): FamilyRow => ({
  id,
  code: id,
  name,
  mpn,
  sizeLabels: labels,
  current: null,
  priceNet: 8.19,
  ...extra,
});

describe("sizeFamilyKey", () => {
  it("groups the HI-DEX gloves, whatever way the size is written", () => {
    const keys = [
      sizeFamilyKey({ name: "ΓΑΝΤΙΑ HI-DEX LEVEL B 7/S 4932480491", mpn: "4932480491", sizeLabels: ["S"] }),
      sizeFamilyKey({ name: "ΓΑΝΤΙΑ HI-DEX LEVEL B 8/M 4932480492", mpn: "4932480492", sizeLabels: ["M"] }),
      sizeFamilyKey({ name: "ΓΑΝΤΙΑ HI-DEX LEVEL B 10/XL 4932480494", mpn: "4932480494", sizeLabels: ["XL"] }),
      // Label 2XL, name XXL.
      sizeFamilyKey({ name: "ΓΑΝΤΙΑ HI-DEX LEVEL B 11/XXL 4932480495", mpn: "4932480495", sizeLabels: ["2XL"] }),
    ];
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("ΓANTIA HI-DEX LEVEL B");
  });

  it("reads M/8, 10 (XL), 7(S), XL-9 and a Greek Μ", () => {
    expect(sizeFamilyKey({ name: "ΓΑΝΤΙΑ ΧΗΜΙΚΗΣ ΠΡΟΣΤΑΣΙΑΣ M/8 4932493229", mpn: "4932493229", sizeLabels: ["M"] }))
      .toBe(sizeFamilyKey({ name: "ΓΑΝΤΙΑ ΧΗΜΙΚΗΣ ΠΡΟΣΤΑΣΙΑΣ XXL/11 4932493232", mpn: "4932493232", sizeLabels: ["2XL"] }));
    expect(sizeFamilyKey({ name: "ΓΑΝΤΙΑ ΓΙΑ ΑΛΥΣ/ΝΟ 10 (XL) 4932493542 MILWAUKEE", mpn: "4932493542", sizeLabels: ["XL"] }))
      .toBe(sizeFamilyKey({ name: "ΓΑΝΤΙΑ ΓΙΑ ΑΛΥΣ/ΝΟ 8 (M) 4932493540 MILWAUKEE", mpn: "4932493540", sizeLabels: ["M"] }));
    expect(sizeFamilyKey({ name: "ΓΑΝΤΙΑ ΚΡΟΥΣΗΣ LEVEL 3/C 7(S) 4932498529", mpn: "4932498529", sizeLabels: ["S"] }))
      .toBe("ΓANTIA KPOYΣHΣ LEVEL 3/C");
    expect(sizeFamilyKey({ name: "ΓΑΝΤΙΑ ΚΑΤΕΔΑΦΙΣΗΣ XL-9 4932471910", mpn: "4932471910", sizeLabels: ["XL"] }))
      .toBe(sizeFamilyKey({ name: "ΓΑΝΤΙΑ ΚΑΤΕΔΑΦΙΣΗΣ L-9 4932471909", mpn: "4932471909", sizeLabels: ["L"] }));
    expect(sizeFamilyKey({ name: "ΓΑΝΤΙΑ ΦΘΟΡΙΖΩΝ LEVEL E 8/Μ 4932479932", mpn: "4932479932", sizeLabels: ["M"] }))
      .toBe(sizeFamilyKey({ name: "ΓΑΝΤΙΑ ΦΘΟΡΙΖΩΝ LEVEL E 9/L 4932479933", mpn: "4932479933", sizeLabels: ["L"] }));
  });

  it("keeps the shoe rule: «No 36» goes with its No", () => {
    expect(
      sizeFamilyKey({ name: "FLEXTRED S1PS ΜΠΟΤΑΚΙ No 36 1M110133 4932493701", mpn: "4932493701", sizeLabels: ["36"] }),
    ).toBe(
      sizeFamilyKey({ name: "FLEXTRED S1PS ΜΠΟΤΑΚΙ No 42 1M110133 4932493707 MILWAUKEE", mpn: "4932493707", sizeLabels: ["42"] }),
    );
  });

  it("never groups without an assigned size, or when the size is not in the name", () => {
    expect(sizeFamilyKey({ name: "ΚΛΕΙΔΙ ΠΙΠΑΣ No 12 4932480000", mpn: "4932480000", sizeLabels: [] })).toBeNull();
    // Labelled L but named M/8: an operator slip, not a size to trust.
    expect(sizeFamilyKey({ name: "ΓΑΝΤΙΑ ΠΟΛ/ΑΝΗΣ M/8- 12τμχ 4932493239", mpn: "4932493239", sizeLabels: ["L"] })).toBeNull();
    // A number alone is not a size (torque, length, pack count).
    expect(sizeFamilyKey({ name: "ΓΑΝΤΙΑ 12 ΤΕΜ 4932493000", mpn: "4932493000", sizeLabels: ["M"] })).toBeNull();
  });

  it("keeps a pack of twelve apart from a single pair", () => {
    expect(sizeFamilyKey({ name: "ΓΑΝΤΙΑ ANTICUT LEVEL B 8/M 12τμχ 4932480607", mpn: "4932480607", sizeLabels: ["M"] }))
      .not.toBe(sizeFamilyKey({ name: "ΓΑΝΤΙΑ ANTICUT LEVEL B 8/M 4932480602", mpn: "4932480602", sizeLabels: ["M"] }));
  });
});

describe("size labels", () => {
  it("shows the size as the name writes it", () => {
    expect(sizeDisplayLabel("ΓΑΝΤΙΑ HI-DEX LEVEL B 8/M 4932480492", ["M"])).toBe("8/M");
    expect(sizeDisplayLabel("ΓΑΝΤΙΑ HI-DEX LEVEL B 11/XXL 4932480495", ["2XL"])).toBe("11/XXL");
    expect(sizeDisplayLabel("ΓΑΝΤΙΑ ΓΙΑ ΑΛΥΣ/ΝΟ 10 (XL) 4932493542", ["XL"])).toBe("10/XL");
    expect(sizeDisplayLabel("FLEXTRED ΜΠΟΤΑΚΙ No 36 1M110133", ["36"])).toBe("36");
    expect(sizeDisplayLabel("ΓΑΝΤΙΑ ΦΘΟΡΙΖΩΝ LEVEL E 8/Μ 4932479932", ["M"])).toBe("8/M");
    expect(sizeDisplayLabel("ΚΑΠΕΛΟ TRUCKER ΜΑΥΡΟ", ["ONE SIZE"])).toBe("ONE SIZE");
  });

  it("orders S < M < L < XL < XXL, numbers numerically", () => {
    expect(["XL", "S", "XXL", "M", "L", "3XL", "XS"].sort(compareSizeLabels)).toEqual([
      "XS", "S", "M", "L", "XL", "XXL", "3XL",
    ]);
    expect(["2XL", "XXXL", "XL"].sort(compareSizeLabels)).toEqual(["XL", "2XL", "XXXL"]);
    expect(["10/XL", "7/S", "11/XXL", "9/L", "8/M"].sort(compareSizeLabels)).toEqual([
      "7/S", "8/M", "9/L", "10/XL", "11/XXL",
    ]);
    // Mixed spellings in one family, and two codes both labelled XL.
    expect(["10/XL", "S/7", "8/M", "11/XL"].sort(compareSizeLabels)).toEqual(["S/7", "8/M", "10/XL", "11/XL"]);
    expect(["44", "36", "40", "9"].sort(compareSizeLabels)).toEqual(["9", "36", "40", "44"]);
    expect(["2XL/3XL", "L/XL", "S/M"].sort(compareSizeLabels)).toEqual(["S/M", "L/XL", "2XL/3XL"]);
  });

  it("strips the size from a family name, and only the size", () => {
    expect(stripSizeToken("ΓΑΝΤΙΑ HI-DEX LEVEL B 8/M 4932480492", ["M"])).toBe("ΓΑΝΤΙΑ HI-DEX LEVEL B 4932480492");
    expect(nameWithoutSize("HI-DEX Level B gloves 9/L", { variantGroup: "g", sizeLabel: "L" })).toBe(
      "HI-DEX Level B gloves",
    );
    // Not in a family: the name is left alone.
    expect(nameWithoutSize("ΓΑΝΤΙΑ 9/L", { variantGroup: null, sizeLabel: "L" })).toBe("ΓΑΝΤΙΑ 9/L");
    // «M18» is not the size M.
    expect(stripSizeToken("M18 FUEL ΜΠΟΥΦΑΝ M 4932464000", ["M"])).toBe("M18 FUEL ΜΠΟΥΦΑΝ 4932464000");
  });

  it("reads the translations: «Size 9/L,» goes with its word and comma", () => {
    expect(
      stripSizeToken("Milwaukee ANTICUT Level B Cut-Resistant Gloves, Size 8/M, EN388:2016 (4242B)", ["M"]),
    ).toBe("Milwaukee ANTICUT Level B Cut-Resistant Gloves, EN388:2016 (4242B)");
    expect(stripSizeToken("Hi-Dex Level B Gloves, Size 11/XXL", ["2XL"])).toBe("Hi-Dex Level B Gloves");
    expect(stripSizeToken("Guanti HI-DEX livello B taglia 9/L", ["L"])).toBe("Guanti HI-DEX livello B");
    expect(sizeDisplayLabel("Hi-Dex Level B Gloves, Size 11/XXL, PU-Coated", ["2XL"])).toBe("11/XXL");
  });

  it("reads a two-size label from one of its sizes («L/XL» labelled L)", () => {
    expect(stripSizeToken("PREMIUM YELLOW VEST L/XL 4932471896", ["L"])).toBe("PREMIUM YELLOW VEST 4932471896");
    expect(sizeFamilyKey({ name: "ΓΙΛΕΚΟ ΚΙΤΡΙΝΟ CONTRACTOR 4XL/5XL 4932493997 MILWAUKEE", mpn: "4932493997", sizeLabels: ["4XL", "XXXL"] }))
      .toBe(sizeFamilyKey({ name: "ΓΙΛΕΚΟ ΚΙΤΡΙΝΟ CONTRACTOR L/XL 4932493995 MILWAUKEE", mpn: "4932493995", sizeLabels: ["L/XL"] }));
  });
});

describe("planSizeFamilies", () => {
  const hiDex = [
    row("21191000912", "ΓΑΝΤΙΑ HI-DEX LEVEL B 7/S 4932480491", "4932480491", ["S"]),
    row("21191000754", "ΓΑΝΤΙΑ HI-DEX LEVEL B 8/M 4932480492", "4932480492", ["M"]),
    row("21192800049", "ΓΑΝΤΙΑ HI-DEX LEVEL B 9/L 4932480493", "4932480493", ["L"]),
    row("21192800050", "ΓΑΝΤΙΑ HI-DEX LEVEL B 10/XL 4932480494", "4932480494", ["XL"]),
    row("21191000753", "ΓΑΝΤΙΑ HI-DEX LEVEL B 11/XXL 4932480495", "4932480495", ["2XL"]),
  ];

  it("makes one family, led by the smallest size", () => {
    const plan = planSizeFamilies(hiDex);
    expect(new Set(hiDex.map((r) => plan.group.get(r.id))).size).toBe(1);
    expect(plan.group.get("21191000912")).toBeTruthy();
    // The smallest size leads, not the lowest code (11/XXL).
    expect([...plan.leads]).toEqual(["21191000912"]);
  });

  it("keeps HDCtool's family and its name, and adds the size it missed", () => {
    const hdc = "ΜΠΛΟΥΖΑ ΕΡΓΑΣΙΑΣ HT SS BL MILWAUKEE";
    const rows = [
      row("a", "ΜΠΛΟΥΖΑ ΕΡΓΑΣΙΑΣ HT SS BL S 1", "1", ["S"], { current: hdc }),
      row("b", "ΜΠΛΟΥΖΑ ΕΡΓΑΣΙΑΣ HT SS BL M 2", "2", ["M"], { current: hdc }),
      row("c", "ΜΠΛΟΥΖΑ ΕΡΓΑΣΙΑΣ HT SS BL XXL 3", "3", ["2XL"]),
    ];
    const plan = planSizeFamilies(rows);
    expect(rows.map((r) => plan.group.get(r.id))).toEqual([hdc, hdc, hdc]);
    expect([...plan.leads]).toEqual(["a"]);
  });

  it("never splits an HDCtool family its own rule made", () => {
    const rows = [
      row("a", "ΚΑΠΕΛΟ X", "1", ["S/M"], { current: "ΚΑΠΕΛΟ" }),
      row("b", "ΚΑΠΕΛΟ Y", "2", ["L/XL"], { current: "ΚΑΠΕΛΟ" }),
    ];
    const plan = planSizeFamilies(rows);
    expect(plan.group.get("a")).toBe("ΚΑΠΕΛΟ");
    expect(plan.group.get("b")).toBe("ΚΑΠΕΛΟ");
  });

  it("dissolves a family of one and never groups rows without a size", () => {
    const plan = planSizeFamilies([
      row("a", "ΓΙΛΕΚΟ ΚΙΤΡΙΝΟ S/M 1", "1", ["S/M"], { current: "ΓΙΛΕΚΟ ΚΙΤΡΙΝΟ MILWAUKEE" }),
      row("b", "ΔΡΑΠΑΝΟ 2", "2", [], { current: "ΔΡΑΠΑΝΟ" }),
    ]);
    expect(plan.group.get("a")).toBeNull();
    expect(plan.group.get("b")).toBeNull();
    expect(plan.leads.size).toBe(0);
  });

  it("refuses a key whose prices are far apart", () => {
    const plan = planSizeFamilies([
      row("a", "ΓΑΝΤΙΑ Χ 8/M 1", "1", ["M"], { priceNet: 4.5 }),
      row("b", "ΓΑΝΤΙΑ Χ 9/L 2", "2", ["L"], { priceNet: 45.9 }),
    ]);
    expect(plan.group.get("a")).toBeNull();
    expect(plan.group.get("b")).toBeNull();
  });

  it("is stable: a second run over its own output changes nothing", () => {
    const first = planSizeFamilies(hiDex);
    const again = planSizeFamilies(hiDex.map((r) => ({ ...r, current: first.group.get(r.id) ?? null })));
    expect([...again.group]).toEqual([...first.group]);
    expect([...again.leads]).toEqual([...first.leads]);
  });

  it("brings back a size that was alone when a sibling arrives", () => {
    const alone = planSizeFamilies([hiDex[0]]);
    expect(alone.group.get(hiDex[0].id)).toBeNull();
    const plan = planSizeFamilies([{ ...hiDex[0], current: null }, hiDex[1]]);
    expect(plan.group.get(hiDex[0].id)).toBe(plan.group.get(hiDex[1].id));
    expect(plan.group.get(hiDex[0].id)).not.toBeNull();
  });
});

describe("onePerFamily", () => {
  it("keeps the first card of each family and every unrelated one", () => {
    const rows = [
      { id: 1, variantGroup: "g" },
      { id: 2, variantGroup: null },
      { id: 3, variantGroup: "g" },
      { id: 4, variantGroup: "h" },
    ];
    expect(onePerFamily(rows).map((r) => r.id)).toEqual([1, 2, 4]);
  });
});
