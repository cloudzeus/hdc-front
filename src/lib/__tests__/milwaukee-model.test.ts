import { describe, expect, it } from "vitest";
import { normalizeModelText, platformOf, parseModel } from "@/lib/milwaukee/model";

describe("normalizeModelText", () => {
  it("turns a Greek Μ in a model into a Latin M", () => {
    expect(normalizeModelText("ΤΣΟΚ Μ18 FPD2 4931479550 MILWAUKEE")).toBe("ΤΣΟΚ M18 FPD2 4931479550 MILWAUKEE");
  });
  it("splits a platform glued to its model", () => {
    expect(normalizeModelText("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ  M18FPD3-502X FUEL 4933479860")).toBe(
      "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-502X FUEL 4933479860",
    );
    expect(normalizeModelText("ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ ΚΡΟΥΣΤΙΚΟ M12BPD-202C 4933441940  MILWAUKEE")).toBe(
      "ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ ΚΡΟΥΣΤΙΚΟ M12 BPD-202C 4933441940 MILWAUKEE",
    );
  });
  it("leaves Greek words that merely contain Μ alone", () => {
    expect(normalizeModelText("ΜΠΑΤΑΡΙΑ ΜΕΓΑΛΗ")).toBe("ΜΠΑΤΑΡΙΑ ΜΕΓΑΛΗ");
  });
});

describe("platformOf", () => {
  it("reads M12, M18 and MX FUEL", () => {
    expect(platformOf("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-0X FUEL")).toBe("M18");
    expect(platformOf("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M12 FPD2-202X")).toBe("M12");
    expect(platformOf("ΓΕΝΝΗΤΡΙΑ MX FUEL MXF PS-602")).toBe("MX");
  });
  it("finds the platform behind a Greek Μ", () => {
    expect(platformOf("ΤΣΟΚ Μ18 FPD2 4931479550")).toBe("M18");
  });
  it("has none for accessories that fit everything", () => {
    expect(platformOf("ΤΡΥΠΑΝΙ ΜΠΕΤΟΥ SDS-PLUS 6X110")).toBeNull();
  });
});

describe("parseModel", () => {
  it("gives the root, the bare tool and its flags", () => {
    expect(parseModel("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-0X FUEL 4933479859 MILWAUKEE")).toEqual({
      platform: "M18",
      root: "M18 FPD3",
      code: "M18 FPD3-0X",
      content: "bare",
      kit: null,
      fuel: true,
      oneKey: false,
    });
  });

  it("reads a two-battery kit from the suffix", () => {
    const m = parseModel("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ  M18FPD3-502X FUEL 4933479860");
    expect(m?.root).toBe("M18 FPD3");
    expect(m?.content).toBe("kit");
    expect(m?.kit).toEqual({ batteries: 2, ah: 5 });
  });

  it("reads 12 Ah single-battery kits and ONE-KEY", () => {
    const m = parseModel("ΜΠΟΥΛΟΝΟΚΛΕΙΔΟ 1\" M18 ONEFHIWF1DS-121C 4933499253");
    expect(m?.root).toBe("M18 ONEFHIWF1DS");
    expect(m?.oneKey).toBe(true);
    expect(m?.fuel).toBe(true);
    expect(m?.kit).toEqual({ batteries: 1, ah: 12 });
  });

  it("says kit but not which batteries when the suffix is ambiguous", () => {
    // 422C is a 4.0 + 2.0 kit; the suffix alone cannot say so — the description can.
    const m = parseModel("ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ ΚΡΟΥΣΤΙΚΟ M18 BLPDRC-422C 4933492825 MILWAUKEE");
    expect(m?.content).toBe("kit");
    expect(m?.kit).toBeNull();
    expect(m?.fuel).toBe(false);
  });

  it("gives no root to an accessory that only names a model", () => {
    expect(parseModel("ΤΣΟΚ Μ18 FPD2 4931479550 MILWAUKEE")).toBeNull();
    expect(parseModel("ΤΣΟΚ M18-FPD 4931454827 MILWAUKEE")).toBeNull();
  });

  it("reads capacity in tenths below 10 Ah and literally at 12 Ah, only from 3-digit suffixes", () => {
    expect(parseModel("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M12 FPD2-202X 4933479868")?.kit).toEqual({ batteries: 2, ah: 2 });
    expect(parseModel("ΜΠΟΥΛΟΝΟΚΛΕΙΔΟ M18 ONEFHIWF1DS-121C 4933499253")?.kit).toEqual({ batteries: 1, ah: 12 });
    expect(parseModel("ΕΡΓΑΛΕΙΟ M18 ABC-32 000")?.kit).toBeNull();
  });

  it("groups the bare tool and its kits under one root", () => {
    const roots = [
      "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M12 FPD2-0 4933479867 MILWAUKEE",
      "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M12 FPD2-202X 4933479868 MILWAUKEE",
      "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M12 FPD2-602X FUEL 4933479870 MILWAUKEE",
    ].map((n) => parseModel(n)?.root);
    expect(new Set(roots)).toEqual(new Set(["M12 FPD2"]));
  });
});
