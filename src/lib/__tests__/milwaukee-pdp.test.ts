import { describe, expect, it } from "vitest";
import {
  boxFacts,
  chargerModel,
  descriptionParagraphs,
  formatSpecValue,
  inTheBox,
  keyNumbers,
  matchBattery,
  numbersIn,
  pdpTitle,
  specTable,
  withTrademark,
} from "@/lib/milwaukee/pdp";
import { kitFromTechBlock, parseTechBlock } from "@/lib/milwaukee/tech-block";

// M18 FPD3-502X's Greek long description as synced from HDCtool (prose shortened).
const FPD3_KIT = `Το κρουστικό δραπανοκατσάβιδο Milwaukee M18FPD3-502X FUEL είναι ένα επαγγελματικό εργαλείο.
Δεύτερη γραμμή της ίδιας παραγράφου.

Ο συμπαγής σχεδιασμός με μήκος μόλις 175 mm επιτρέπει την πρόσβαση σε στενούς χώρους.

Τεχνικά χαρακτηριστικά:
Κωδικός: 4933479860
Χωρητικότητα τσοκ (mm): 13
Μέγιστη διάτρηση δομικών υλικών (mm): 16
Μέγιστη διάτρηση σιδηρού (mm): 16
Μέγιστη διάτρηση ξύλου (mm): 89
Μέγιστη συχνότητα κρούσης (bpm): 0-33,000
Μέγιστη ροπή (Nm): 158
Ταχύτητα χωρίς φορτίο 1 (rpm): 0 – 500
Ταχύτητα χωρίς φορτίο 2 (rpm): 0 – 2100
Βασικός εξοπλισμός: Κλιπ ζώνης, πλαϊνή χειρολαβή
Παραδίδεται σε: HD Box
Χωρητικότητα μπαταρίας (Ah): 5.0
Τύπος μπαταρίας: Li-ion
Περιλαμβάνεται φορτιστής: Μ12 – Μ18 FC Ταχφορτιστής
Αρ. παρεχόμενων μπαταριών: 2
Τάση (V): 18
Βάρος με μπαταρία (EPTA) (kg): 2.2 (M18 B5)`;

// The bare tool's block: dashes for the battery rows, a negative charger line.
const FPD3_BARE = `Τεχνικά χαρακτηριστικά:
Κωδικός: 4933479859
Μέγιστη ροπή (Nm): 158
Βασικός εξοπλισμός: Κλιπ ζώνης, πλαϊνή χειρολαβή
Παραδίδεται σε: HD Box
Χωρητικότητα μπαταρίας (Ah): -
Περιλαμβάνεται φορτιστής: Δεν παρέχεται φορτιστής
Αρ. παρεχόμενων μπαταριών: -`;

const kitRows = parseTechBlock(FPD3_KIT);

describe("numbersIn", () => {
  it("reads thousands separators and ranges", () => {
    expect(numbersIn("0-33,000")).toEqual([0, 33000]);
    expect(numbersIn("0 – 2100")).toEqual([0, 2100]);
    expect(numbersIn("2.2 (M18 B5)")).toEqual([2.2, 18, 5]);
    expect(numbersIn("5,0")).toEqual([5]);
  });
});

describe("keyNumbers", () => {
  it("gives the FPD3's four numbers from the manufacturer's block — 158 Nm, not 135", () => {
    expect(keyNumbers(kitRows, "el")).toEqual([
      { key: "torque", value: "158", unit: "NM" },
      { key: "speed", value: "2.100", unit: "RPM" },
      { key: "impact", value: "33.000", unit: "BPM" },
      { key: "chuck", value: "13", unit: "MM" },
    ]);
  });

  it("formats for the page's language", () => {
    expect(keyNumbers(kitRows, "en").map((k) => k.value)).toEqual(["158", "2,100", "33,000", "13"]);
  });

  it("matches the other ways the source words the lines", () => {
    const rows = parseTechBlock(`Τεχνικά χαρακτηριστικά:
Μεγίστη ροπή στρέψης (Nm): 1356
Χωρίς φορτίο ταχύτητα (σ.α.λ.): 0 - 1800
Ρυθμός κρούσης (ipm): 0 - 2400
Υποδοχή: 1/2″`);
    expect(keyNumbers(rows, "el")).toEqual([
      { key: "torque", value: "1.356", unit: "NM" },
      { key: "speed", value: "1.800", unit: "RPM" },
      { key: "impact", value: "2.400", unit: "IPM" },
      { key: "drive", value: "1/2″", unit: "" },
    ]);
  });

  it("ignores speeds that are not revolutions and falls back to impact energy", () => {
    const rows = parseTechBlock(`Τεχνικά χαρακτηριστικά:
Ταχύτητα χωρίς φορτίο (m/min): 0 - 150
Ενέργεια κρούσης (EPTA) (J): 2,5`);
    expect(keyNumbers(rows, "el")).toEqual([{ key: "energy", value: "2,5", unit: "J" }]);
  });

  it("is empty without a block", () => {
    expect(keyNumbers([], "el")).toEqual([]);
  });
});

describe("pdpTitle", () => {
  it("names the model root, without the suffix, FUEL or the article number", () => {
    expect(pdpTitle("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ  M18FPD3-502X FUEL 4933479860", "4933479860")).toBe(
      "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3",
    );
    expect(pdpTitle("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-0X FUEL 4933479859", "4933479859")).toBe(
      "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3",
    );
  });

  it("leaves a name without a tool code as the card prints it", () => {
    expect(pdpTitle("ΜΠΑΤΑΡΙΑ 18V 5.0AH M18 B5 4932430483", "4932430483")).toBe("ΜΠΑΤΑΡΙΑ 18V 5.0AH M18 B5");
  });

  it("adds the trademark to FUEL tags", () => {
    expect(withTrademark("M18 FUEL")).toBe("M18 FUEL™");
    expect(withTrademark("M12")).toBe("M12");
  });
});

describe("descriptionParagraphs", () => {
  it("keeps only the prose before the spec block, one entry per paragraph", () => {
    expect(descriptionParagraphs(FPD3_KIT)).toEqual([
      "Το κρουστικό δραπανοκατσάβιδο Milwaukee M18FPD3-502X FUEL είναι ένα επαγγελματικό εργαλείο. Δεύτερη γραμμή της ίδιας παραγράφου.",
      "Ο συμπαγής σχεδιασμός με μήκος μόλις 175 mm επιτρέπει την πρόσβαση σε στενούς χώρους.",
    ]);
  });

  it("stops at the English and Italian headings too", () => {
    expect(descriptionParagraphs("One.\n\nTwo.\n\nTechnical specifications:\n- Code: 1")).toEqual(["One.", "Two."]);
    expect(descriptionParagraphs("Uno.\n\nSpecifiche tecniche:\nCodice: 1")).toEqual(["Uno."]);
  });

  it("is empty for nothing", () => {
    expect(descriptionParagraphs(null)).toEqual([]);
    expect(descriptionParagraphs("Τεχνικά χαρακτηριστικά:\nΤάση (V): 18")).toEqual([]);
  });
});

describe("specTable", () => {
  it("drops the code row and moves the unit into the value", () => {
    const table = specTable(kitRows, "el");
    expect(table.find((r) => r.label.startsWith("Κωδικός"))).toBeUndefined();
    expect(table).toContainEqual({ label: "Μέγιστη ροπή", value: "158 Nm" });
    expect(table).toContainEqual({ label: "Ταχύτητα χωρίς φορτίο 2", value: "0 – 2.100 rpm" });
    expect(table).toContainEqual({ label: "Μέγιστη συχνότητα κρούσης", value: "0 – 33.000 bpm" });
    expect(table).toContainEqual({ label: "Βάρος με μπαταρία (EPTA)", value: "2,2 kg (M18 B5)" });
    expect(table).toContainEqual({ label: "Τύπος μπαταρίας", value: "Li-ion" });
    expect(table).toContainEqual({ label: "Χωρητικότητα μπαταρίας", value: "5,0 Ah" });
  });

  it("leaves model codes and article numbers alone", () => {
    expect(formatSpecValue("Μ12 – Μ18 FC Ταχφορτιστής", "el")).toBe("Μ12 – Μ18 FC Ταχφορτιστής");
    expect(formatSpecValue("Σετ 4932471828", "el")).toBe("Σετ 4932471828");
    expect(formatSpecValue("1/2″", "el")).toBe("1/2″");
  });
});

describe("boxFacts", () => {
  it("reads the kit's contents", () => {
    expect(boxFacts(kitRows)).toEqual({
      batteries: { count: 2, ah: 5 },
      charger: "M12–M18 FC",
      case: "HD Box",
      accessories: ["Κλιπ ζώνης", "πλαϊνή χειρολαβή"],
    });
  });

  it("knows a bare tool has no batteries and no charger", () => {
    expect(boxFacts(parseTechBlock(FPD3_BARE))).toEqual({
      batteries: null,
      charger: null,
      case: "HD Box",
      accessories: ["Κλιπ ζώνης", "πλαϊνή χειρολαβή"],
    });
  });

  it("reads the other battery-count labels", () => {
    const rows = parseTechBlock("Τεχνικά χαρακτηριστικά:\nΑρ. Μπαταριών: 2\nΧωρητικότητα μπαταρίας: 5,0 Ah");
    expect(kitFromTechBlock(rows)).toEqual({ batteries: 2, ah: 5 });
  });

  it("extracts the charger model from the Greek wording", () => {
    expect(chargerModel("Μ12 – Μ18 FC Ταχφορτιστής")).toBe("M12–M18 FC");
    expect(chargerModel("Ναι")).toBe("");
  });
});

const CATALOGUE = [
  { name: "ΜΠΑΤΑΡΙΑ 18V 5,0AH M18Β5-CR 4932479265", inStock: false },
  { name: "ΜΠΑΤΑΡΙΑ 18V 5.0AH M18 B5 4932430483", inStock: true },
  { name: "ΜΠΑΤΑΡΙΑ 18V 8,0AH M18 B8 4932471070 MILWAUKEE", inStock: false },
  { name: "ΜΠΑΤΑΡΙΑ FORGE M18 FB8 8.0AH 4932492131", inStock: true },
  { name: "ΜΠΑΤΑΡΙΑ LI-ION M12B4 - 4AH 4932430065", inStock: true },
  { name: "ΜΠΑΤΑΡΙΑ LI-ON M18 HB5.5 5.5 Ah 4932464712", inStock: false },
  { name: "ΑΕΡΟΣΥΜΠΙΕΣΤΗΣ ΜΠΑΤΑΡΙΑΣ M12 BI-0 4933464124", inStock: true },
];

describe("matchBattery", () => {
  it("finds M18 B5 for a 5.0Ah M18 kit, not the -CR variant", () => {
    expect(matchBattery(CATALOGUE, "M18", 5)).toEqual({ product: CATALOGUE[1], code: "M18 B5" });
  });

  it("reads a platform glued to the battery code", () => {
    expect(matchBattery(CATALOGUE, "M12", 4)?.code).toBe("M12 B4");
  });

  it("prefers the standard battery, then HIGH OUTPUT, then FORGE", () => {
    expect(matchBattery(CATALOGUE, "M18", 8)?.code).toBe("M18 B8");
    expect(matchBattery(CATALOGUE, "M18", 5.5)?.code).toBe("M18 HB5.5");
  });

  it("is null when the catalogue has none, or for MX FUEL", () => {
    expect(matchBattery(CATALOGUE, "M12", 6)).toBeNull();
    expect(matchBattery(CATALOGUE, "MX", 3)).toBeNull();
  });
});

describe("inTheBox", () => {
  it("lists tool, batteries, charger, case and accessories for the kit", () => {
    const tiles = inTheBox({ facts: boxFacts(kitRows), platform: "M18", isTool: true, batteries: CATALOGUE });
    expect(tiles.map((t) => [t.kind, t.qty])).toEqual([
      ["tool", "1×"],
      ["battery", "2×"],
      ["charger", "1×"],
      ["case", "1×"],
      ["accessories", "1+1"],
    ]);
    expect(tiles[1]).toMatchObject({ kind: "battery", ah: 5, code: "M18 B5", product: CATALOGUE[1] });
  });

  it("keeps a placeholder battery tile when the catalogue has no match", () => {
    const tiles = inTheBox({
      facts: { batteries: { count: 2, ah: 6 }, charger: null, case: null, accessories: [] },
      platform: "M12",
      isTool: true,
      batteries: CATALOGUE,
    });
    expect(tiles[1]).toMatchObject({ kind: "battery", ah: 6, code: null, product: null });
  });

  it("shows the bare tool with its case and accessories only", () => {
    const tiles = inTheBox({
      facts: boxFacts(parseTechBlock(FPD3_BARE)),
      platform: "M18",
      isTool: true,
      batteries: CATALOGUE,
    });
    expect(tiles.map((t) => t.kind)).toEqual(["tool", "case", "accessories"]);
  });

  it("falls back to the model suffix for a kit without the lines", () => {
    const tiles = inTheBox({
      facts: { batteries: null, charger: null, case: null, accessories: [] },
      platform: "M18",
      isTool: true,
      kitFallback: { batteries: 2, ah: 5 },
      batteries: CATALOGUE,
    });
    expect(tiles.map((t) => t.kind)).toEqual(["tool", "battery"]);
  });

  it("is empty when the block names nothing in the box", () => {
    expect(
      inTheBox({
        facts: { batteries: null, charger: null, case: null, accessories: [] },
        platform: "M18",
        isTool: true,
        batteries: CATALOGUE,
      }),
    ).toEqual([]);
  });
});
