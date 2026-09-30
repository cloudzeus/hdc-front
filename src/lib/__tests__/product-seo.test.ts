import { describe, expect, it } from "vitest";
import { greekKind, productDescription, productFeedTitle, productH1, productImageAlt, productTitle } from "@/lib/seo/product-seo";

const FPD3_KIT = {
  erpName: "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ  M18FPD3-502X FUEL 4933479860",
  code2: "4933479860",
  greekTexts: [
    "Κρουστικό δραπανοκατσάβιδο Milwaukee M18FPD3-502X FUEL με κινητήρα POWERSTATE χωρίς ψήκτρες, ροπή 158 Nm.",
  ],
};

describe("greekKind", () => {
  it("is what the tool is, from the ERP name, with the accents the descriptions spell", () => {
    expect(greekKind(FPD3_KIT)).toBe("Κρουστικό δραπανοκατσάβιδο");
  });

  it("keeps the words before the model, dropping code, brand and FUEL", () => {
    expect(
      greekKind({
        erpName: 'ΜΠΟΥΛΟΝΟΚΛΕΙΔΟ 1/2" M18 FHIW2F12-0X FUEL 4933492782',
        code2: "4933492782",
        greekTexts: ['Μπουλονόκλειδο 1/2" M18 FUEL της Milwaukee.'],
      }),
    ).toBe('Μπουλονόκλειδο 1/2"');
  });

  it("stays in capitals when a word's accents cannot be found — never misspelt", () => {
    expect(greekKind({ erpName: 'ΜΠΟΥΛ/ΔΟ 1/2" M18 FHIW2F12-0 FUEL 4933498056 MILWAUKEE', code2: "4933498056", greekTexts: [] })).toBe(
      'ΜΠΟΥΛ/ΔΟ 1/2"',
    );
  });

  it("is the whole clean name for a product without a model code", () => {
    expect(greekKind({ erpName: "ΤΑΜΠΑΚΙΕΡΑ PACKOUT 4932464082", code2: "4932464082", greekTexts: ["Ταμπακιέρα PACKOUT της Milwaukee."] })).toBe(
      "Ταμπακιέρα PACKOUT",
    );
  });
});

describe("productTitle", () => {
  it("is «Milwaukee {model} {kind} | {code}» in Greek", () => {
    expect(productTitle({ ...FPD3_KIT, locale: "el", name: FPD3_KIT.erpName })).toBe(
      "Milwaukee M18 FPD3-502X Κρουστικό δραπανοκατσάβιδο | 4933479860",
    );
  });

  it("cuts the kind, never the model or the code, to stay within 65 characters", () => {
    const title = productTitle({
      locale: "el",
      name: "",
      erpName: "ΕΠΑΝΑΦΟΡΤΙΖΟΜΕΝΟ ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ ΥΨΗΛΗΣ ΑΠΟΔΟΣΗΣ M18 ONEFHPX-552X 4933478496",
      code2: "4933478496",
      greekTexts: [],
    });
    expect(title.length).toBeLessThanOrEqual(65);
    expect(title.startsWith("Milwaukee M18 ONEFHPX-552X ")).toBe(true);
    expect(title.endsWith(" | 4933478496")).toBe(true);
  });

  it("uses the translated name for the kind on en/it pages", () => {
    const title = productTitle({
      ...FPD3_KIT,
      locale: "en",
      name: "M18 FUEL 18V Brushless Cordless 13mm Hammer Drill/Driver Kit (2x5.0Ah)",
    });
    expect(title.startsWith("Milwaukee M18 FPD3-502X ")).toBe(true);
    expect(title).toContain("Hammer");
    expect(title.endsWith(" | 4933479860")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(65);
  });

  it("names a product without a model by what it is", () => {
    expect(
      productTitle({ locale: "el", name: "", erpName: "ΤΑΜΠΑΚΙΕΡΑ PACKOUT 4932464082", code2: "4932464082", greekTexts: ["Ταμπακιέρα PACKOUT."] }),
    ).toBe("Milwaukee Ταμπακιέρα PACKOUT | 4932464082");
  });
});

describe("productH1", () => {
  it("is «Milwaukee {kind} {model}», so the bare tool and the kit differ", () => {
    expect(productH1({ ...FPD3_KIT, locale: "el", name: "" })).toBe("Milwaukee Κρουστικό δραπανοκατσάβιδο M18 FPD3-502X");
    expect(
      productH1({
        locale: "el",
        name: "",
        erpName: "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-0X FUEL 4933479859",
        code2: "4933479859",
        greekTexts: FPD3_KIT.greekTexts,
      }),
    ).toBe("Milwaukee Κρουστικό δραπανοκατσάβιδο M18 FPD3-0X");
  });
});

describe("productDescription", () => {
  const base = { ...FPD3_KIT, locale: "el" as const, name: "", availability: "stock" as const, qty: 4, keySpec: { key: "torque" as const, value: "158", unit: "NM" } };

  it("always says code, model, Piraeus, availability and the first key figure", () => {
    const d = productDescription(base);
    expect(d).toContain("4933479860");
    expect(d).toContain("M18 FPD3-502X");
    expect(d).toContain("Πειραιά");
    expect(d).toContain("Σε απόθεμα");
    expect(d).toContain("158 Nm");
    expect(d.length).toBeLessThanOrEqual(155);
  });

  it("states the supplier and order availability as the page does", () => {
    expect(productDescription({ ...base, availability: "supplier" })).toContain("3–5 εργάσιμες");
    expect(productDescription({ ...base, availability: "order" })).toContain("1–3 εργάσιμες");
  });

  it("works without a key figure or a model", () => {
    const d = productDescription({ locale: "el", name: "", erpName: "ΤΑΜΠΑΚΙΕΡΑ PACKOUT 4932464082", code2: "4932464082", greekTexts: [], availability: "stock", qty: 1, keySpec: null });
    expect(d).toContain("4932464082");
    expect(d).toContain("Πειραιά");
  });

  it("has English and Italian versions", () => {
    expect(productDescription({ ...base, locale: "en" })).toMatch(/Piraeus/);
    expect(productDescription({ ...base, locale: "it" })).toMatch(/Pireo/);
  });
});

describe("productFeedTitle", () => {
  it("is «Milwaukee {model} {kind} {code}»", () => {
    expect(productFeedTitle({ ...FPD3_KIT, locale: "el", name: FPD3_KIT.erpName })).toBe(
      "Milwaukee M18 FPD3-502X Κρουστικό δραπανοκατσάβιδο 4933479860",
    );
  });
});

describe("productImageAlt", () => {
  it("is «Milwaukee {model} {kind} – {code}»", () => {
    expect(productImageAlt({ ...FPD3_KIT, locale: "el", name: "" })).toBe(
      "Milwaukee M18 FPD3-502X Κρουστικό δραπανοκατσάβιδο – 4933479860",
    );
  });
});
