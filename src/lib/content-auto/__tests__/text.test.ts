import { describe, expect, it } from "vitest";
import {
  articleSlug,
  codeMentions,
  jaccard,
  labelUnit,
  modelMentions,
  numberMentions,
  numberReadings,
  similarity,
  supportedNumbers,
  unsupportedNumbers,
  wordSet,
} from "@/lib/content-auto/text";

describe("articleSlug", () => {
  it("transliterates like every other slug of the shop", () => {
    expect(articleSlug("M18 FHIW2F12 ή M18 ONEFHIWF12; Σύγκριση")).toBe("m18-fhiw2f12-i-m18-onefhiwf12-sygkrisi");
    expect(articleSlug("Πώς διαλέγω δράπανο")).toBe("pos-dialego-drapano");
    expect(articleSlug("Μπαταρίες: πόσα Ah;")).toBe("bataries-posa-ah");
  });

  it("cuts a long title at a word boundary, never past 80 characters", () => {
    const slug = articleSlug(
      "Milwaukee M18 FPD3: όλες οι εκδόσεις του κρουστικού δραπανοκατσάβιδου, σύγκριση κιτ και σκέτου εργαλείου, για ποιον είναι",
    );
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(slug.startsWith("milwaukee-m18-fpd3-oles-oi-ekdoseis")).toBe(true);
  });
});

describe("similarity", () => {
  it("ignores the template words, so two «πώς διαλέγω» guides differ", () => {
    expect(similarity("Πώς διαλέγω γάντια Milwaukee", "Πώς διαλέγω τρυπάνια Milwaukee")).toBe(0);
  });

  it("sees the same subject through accents, case and plural", () => {
    expect(similarity("Πώς διαλέγω δράπανο", "ΔΡΑΠΑΝΑ: οδηγός επιλογής")).toBe(1);
    expect(similarity("Σέγα μπαταρίας", "σεγα μπαταριας milwaukee")).toBe(1);
  });

  it("is Jaccard over word sets", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set(["a"]))).toBe(0);
    expect([...wordSet("Το M18 FPD3 και το M18 FID3")].sort()).toEqual(["fid3", "fpd3", "m18"]);
  });
});

describe("numbers", () => {
  it("reads thousands and decimals both ways", () => {
    expect(numberReadings("33,000")).toEqual(expect.arrayContaining([33000, 33]));
    expect(numberReadings("2.100")).toEqual(expect.arrayContaining([2100]));
    expect(numberReadings("5,0")).toEqual([5]);
    expect(numberReadings("33 000")).toEqual([33000]);
  });

  it("finds numbers with units, ranges and the spellings of rpm", () => {
    const found = numberMentions("158 Nm, 0–2100 rpm, 0 - 500 min-1, 2.100 min⁻¹, 5,0 Ah, 18V, 360°, 33.000 bpm");
    expect(found.map((m) => m.unit)).toEqual(["nm", "rpm", "rpm", "rpm", "ah", "v", "deg", "bpm"]);
    expect(found[1].readings).toEqual([[0], [2100]]);
  });

  it("does not read a model code as a number", () => {
    expect(numberMentions("M18 FPD3-502X και M12-18 FC")).toEqual([]);
  });

  it("takes the unit of a catalogue row from its label", () => {
    expect(labelUnit("Βάρος με μπαταρία (EPTA) (kg)")).toBe("kg");
    expect(labelUnit("Ταχύτητα χωρίς φορτίο (σ.α.λ.)")).toBe("rpm");
    expect(labelUnit("Κωδικός")).toBeNull();
  });

  it("supports what the pack states and nothing else", () => {
    const supported = supportedNumbers(
      ["Μπαταρία 5,0 Ah"],
      [
        { label: "Μέγιστη ροπή (Nm)", value: "158" },
        { label: "Μέγιστη συχνότητα κρούσης (bpm)", value: "0-33,000" },
        { label: "Βάρος με μπαταρία (EPTA) (kg)", value: "2.2 (M18 B5)" },
        { label: "No-load speed", value: "0 - 2100", unit: "min-1" },
      ],
    );
    expect(unsupportedNumbers("158 Nm, 33.000 bpm, 2,2 kg, 0–2100 rpm, 5.0 Ah", supported)).toEqual([]);
    expect(unsupportedNumbers("135 Nm και 1800 rpm", supported)).toEqual(["135 Nm", "1800 rpm"]);
  });
});

describe("numbers, as the review asked (I1)", () => {
  const supported = supportedNumbers(
    ["Μπαταρία 12,0 Ah"],
    [
      { label: "Μέγιστη συχνότητα κρούσης (bpm)", value: "0-33.000" },
      { label: "Ισχύς (kW)", value: "1,5" },
      { label: "Υποδοχή", value: '1/2"' },
      { label: "Εγγύηση", value: "3 έτη" },
      { label: "Στάθμη θορύβου (dB(A))", value: "95" },
    ],
  );
  it("reads units in any case and the Greek look-alike Νm", () => {
    expect(numberMentions("158 NM και 158 Νm").map((m) => m.unit)).toEqual(["nm", "nm"]);
  });
  it("reads kW, Wh, cm, m, dB, °C, %, m/s², inches and κιλά", () => {
    const units = numberMentions('1,5 kW, 72 Wh, 30 cm, 2 m, 95 dB(A), 60 °C, 30%, 4,5 m/s², 1/2", ½″, 3 ίντσες, 2 κιλά').map((m) => m.unit);
    expect(units).toEqual(["kw", "wh", "cm", "m", "db", "degc", "pct", "ms2", "inch", "kg", "inch", "inch"]);
  });
  it("reads a multiplier before the number", () => {
    expect(numberMentions("2x12,0Ah")[0]).toMatchObject({ unit: "ah", readings: [[12]] });
    expect(unsupportedNumbers("2x12,0Ah", supported)).toEqual([]);
  });
  it("reads number words before a unit", () => {
    expect(numberMentions("δεκαοκτώ V")[0]).toMatchObject({ unit: "v", readings: [[18]] });
  });
  it("reads Milwaukee's official labels and units: «[mm]», «⌀ cm»", () => {
    const official = supportedNumbers([], [
      { label: "Cutting height [mm]", value: "25 - 100" },
      { label: "Front wheel", value: "18.8", unit: "⌀ cm" },
    ]);
    expect(unsupportedNumbers("ύψος κοπής 25–100 mm, τροχός 18,8 cm", official)).toEqual([]);
  });
  it("a pack range «0-33.000 bpm» does not support «33 bpm»", () => {
    expect(unsupportedNumbers("33.000 bpm", supported)).toEqual([]);
    expect(unsupportedNumbers("33 bpm", supported)).toEqual(["33 bpm"]);
  });
  it("bare numbers of ten or more, and durations, must be in the pack", () => {
    expect(unsupportedNumbers("30 φορές πιο γρήγορο", supported)).toEqual(["30"]);
    expect(unsupportedNumbers("εγγύηση 5 ετών", supported)).toEqual(["5 ετών"]);
    expect(unsupportedNumbers("το M18 FPD3-502X, 4933479859, 2 μπαταρίες, 95 dB(A)", supported)).toEqual([]);
  });
});

describe("codes and models", () => {
  it("finds models, with and without the kit suffix, whatever the spelling", () => {
    expect(modelMentions("Το M18 FPD3-502X και το Μ18FID3 είναι M18 FUEL™")).toEqual([
      { root: "M18 FPD3", full: "M18 FPD3-502X" },
      { root: "M18 FID3", full: null },
    ]);
  });

  it("never joins two lines or keywords into a model («m18» + «Milwaukee …»)", () => {
    expect(modelMentions("φυσητήρας m18\n\nmilwaukee φυσητήρας\n\nm18 fblg3")).toEqual([{ root: "M18 FBLG3", full: null }]);
    expect(modelMentions("Milwaukee M18 Milwaukee, M18 M18 FUEL")).toEqual([]);
  });

  it("finds article numbers and EANs, not other numbers", () => {
    expect(codeMentions("Κωδικός 4933479859, 158 Nm, EAN 4058546294489, 2100 rpm")).toEqual(["4933479859", "4058546294489"]);
  });
});
