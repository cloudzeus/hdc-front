import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  BOX_LABEL,
  STORE_FACTS,
  isBareModel,
  describeProduct,
  packNumbers,
  packProduct,
  pickRepresentative,
  promptPack,
  type FactPack,
  type RawProduct,
} from "@/lib/content-auto/fact-pack";
import { unsupportedNumbers } from "@/lib/content-auto/text";

const DESCRIPTION = [
  "Το κρουστικό δραπανοκατσάβιδο M18 FPD3 έχει κινητήρα POWERSTATE χωρίς ψήκτρες.",
  "Τώρα σε τιμή 199 € με δωρεάν μεταφορικά.",
  "Υπάρχει σε απόθεμα στο κατάστημα.",
  "",
  "Τεχνικά χαρακτηριστικά:",
  "Κωδικός: 4933479859",
  "Μέγιστη ροπή (Nm): 158",
  "Ταχύτητα χωρίς φορτίο 2 (rpm): 0 – 2100",
  "Χωρητικότητα μπαταρίας (Ah): 5.0",
  "Αρ. παρεχόμενων μπαταριών: 2",
].join("\n");

const raw = (over: Partial<RawProduct> = {}): RawProduct => ({
  code2: "4933479860",
  name: "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-502X FUEL 4933479860 MILWAUKEE",
  slug: "fpd3-502x",
  modelRoot: "M18 FPD3",
  modelContent: "kit",
  platform: "M18",
  isFuel: true,
  isOneKey: false,
  image: "https://cdn.test/fpd3.webp",
  longDescriptionEl: DESCRIPTION,
  ...over,
});

describe("describeProduct", () => {
  it("keeps the prose and drops every sentence about price or stock", () => {
    const text = describeProduct(DESCRIPTION)!;
    expect(text).toContain("POWERSTATE");
    expect(text).not.toMatch(/€|τιμή|απόθεμα|Τεχνικά/);
  });
});

describe("packProduct", () => {
  it("reads model, kit and specs from the catalogue", () => {
    const p = packProduct(raw(), { specs: [{ name: "Max torque", value: "158", unit: "Nm" }], url: "https://www.milwaukeetool.eu/x" });
    expect(p).toMatchObject({
      code: "4933479860",
      model: "M18 FPD3-502X",
      root: "M18 FPD3",
      platform: "M18",
      fuel: true,
      content: "κιτ",
      kit: "2 μπαταρίες 5,0 Ah",
      url: "/proion/fpd3-502x",
      officialUrl: "https://www.milwaukeetool.eu/x",
    });
    expect(p.name).toBe("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-502X FUEL");
    expect(p.specs.map((s) => s.label)).not.toContain("Κωδικός");
  });

  it("says a bare tool comes without batteries", () => {
    const p = packProduct(raw({ name: "ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-0X FUEL", modelContent: "bare" }), null);
    expect(p.content).toMatch(/^σκέτο/);
    expect(p.kit).toBeNull();
  });
});

describe("the pack", () => {
  const pack = (): FactPack => ({
    topic: { kind: "MODEL", title: "Milwaukee M18 FPD3", keyword: "m18 fpd3", keywords: ["m18 fpd3"], categoryName: null },
    articleKind: "ARTICLE",
    products: [
      packProduct(raw({ image: null }), null),
      packProduct(raw({ code2: "4933479859", name: "ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-0X", modelContent: "bare", slug: "fpd3-0x" }), null),
    ],
    links: [{ href: "/proion/fpd3-0x", anchor: "M18 FPD3-0X" }],
    store: STORE_FACTS,
    sources: [],
    representative: null,
    notes: [],
  });

  it("never carries a price, a stock level, a quantity or a photo to the writer", () => {
    const text = JSON.stringify(promptPack(pack()));
    expect(text).not.toMatch(/€|priceNet|price|qty|inStock|stock|απόθεμα|cdn\.test/i);
    // The store: Piraeus, pick-up, delivery — no hours, days or amounts.
    expect(STORE_FACTS.join(" ")).not.toMatch(/\d{1,2}:\d{2}|€|ευρώ|ημέρ|ώρ|εργάσιμ/);
  });

  it("leads with the bare tool that has a photo", () => {
    expect(pickRepresentative(pack().products, "MODEL", new Set(["cdn.test"]))).toBe("4933479859");
    expect(pickRepresentative(pack().products.slice(0, 1), "MODEL", new Set(["cdn.test"]))).toBeNull();
  });

  it("supports the numbers it states", () => {
    const supported = packNumbers(pack());
    expect(unsupportedNumbers("158 Nm, 0–2100 rpm, 5,0 Ah", supported)).toEqual([]);
    expect(unsupportedNumbers("135 Nm", supported)).toEqual(["135 Nm"]);
  });
});

describe("a bare tool carries no kit contents (C2)", () => {
  /** The real catalogue block of the M18 FMTIW2F12-0X, as it is in the database. */
  const REAL = [
    "Το μπουλονόκλειδο M18 FMTIW2F12-0X έχει δακτύλιο συγκράτησης.",
    "Το σετ περιλαμβάνει δύο μπαταρίες M18 B5 5,0 Ah και φορτιστή M12-18 FC.",
    "Παραδίδεται σε HD Box, χωρίς μπαταρίες και φορτιστή.",
    "",
    "Τεχνικά χαρακτηριστικά:",
    "Μέγιστη ροπή στερέωσης (Nm): 745",
    "Σετ περιλαμβάνονται: 2 x M18 B5, M12-18 FC, HD Box",
    "Χωρητικότητα μπαταρίας (Ah): 5.0",
    "Αρ. παρεχόμενων μπαταριών: 2",
    "Παραδίδεται σε: HD Box",
    "Βάρος με μπαταρία (EPTA) (kg): 2.3 (M18 B5)",
  ].join("\n");
  const bare = packProduct(
    raw({ name: "ΜΠΟΥΛΟΝΟΚΛΕΙΔΟ 1/2\" M18 FMTIW2F12-0X", modelContent: "kit", longDescriptionEl: REAL }),
    { specs: [{ name: "Batteries included", value: "2 x M18 B5", unit: null }, { name: "Max torque", value: "745", unit: "Nm" }], url: null },
  );

  it("knows a bare model by its suffix, whatever the catalogue says", () => {
    expect(isBareModel("M18 FMTIW2F12-0X")).toBe(true);
    expect(isBareModel("M18 FPD3-0")).toBe(true);
    expect(isBareModel("M18 FPD3-0C")).toBe(true);
    expect(isBareModel("M18 FPD3-502X")).toBe(false);
    expect(bare.content).toMatch(/^σκέτο/);
    expect(bare.kit).toBeNull();
  });

  it("drops the kit row «2 x M18 B5, M12-18 FC, HD Box» and every battery row, keeps HD Box and the weight", () => {
    const values = bare.specs.map((r) => r.value).join(" | ");
    expect(values).not.toMatch(/M18 B5|M12-18|Ah|μπαταρ/i);
    expect(bare.specs).toContainEqual({ label: "Παραδίδεται σε", value: "HD Box" });
    expect(bare.specs).toContainEqual({ label: "Βάρος με μπαταρία (EPTA) (kg)", value: "2.3" });
    expect(bare.specs.some((r) => BOX_LABEL.test(r.label) && !/βάρος/i.test(r.label))).toBe(false);
  });

  it("drops battery sentences from the description unless they say «χωρίς», and battery official specs", () => {
    expect(bare.description).not.toMatch(/M18 B5|5,0 Ah|M12-18/);
    expect(bare.description).toContain("χωρίς μπαταρίες και φορτιστή");
    expect(bare.official).toEqual([{ name: "Max torque", value: "745", unit: "Nm" }]);
  });

  it("so the numbers gate cannot lean on them", () => {
    const pack: FactPack = {
      topic: { kind: "MODEL", title: "t", keyword: "k", keywords: [], categoryName: null },
      articleKind: "ARTICLE",
      products: [bare],
      links: [],
      store: STORE_FACTS,
      sources: [],
      representative: null,
      notes: [],
    };
    const supported = packNumbers(pack);
    expect(unsupportedNumbers("745 Nm, 2,3 kg", supported)).toEqual([]);
    expect(unsupportedNumbers("5,0 Ah", supported)).toEqual(["5,0 Ah"]);
  });

  it("a kit keeps its box", () => {
    const kit = packProduct(raw({ longDescriptionEl: REAL.replace("-0X", "-502X") }), null);
    expect(JSON.stringify(kit.specs)).toContain("M18 B5");
  });
});
