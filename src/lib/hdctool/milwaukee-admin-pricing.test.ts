import { describe, expect, it } from "vitest";
import {
  calculateMilwaukee1364PriceR02,
  eshopPriceWithVat,
  marginPct,
  priceWFor,
  ratioLabel,
} from "./milwaukee-admin-pricing";

/*
 * Ισοδυναμία με το HDCtool: οι αναμενόμενες τιμές βγήκαν τρέχοντας τα
 * `calculateMilwaukee1364PriceR02` (milwaukee-1364-pricing.ts) και `priceWFor`
 * (milwaukee-xml-markup.ts) του HDCtool με αυτά ακριβώς τα ορίσματα (2026-09-30).
 */
describe("calculateMilwaukee1364PriceR02 (ίδιο με το HDCtool)", () => {
  const cases: Array<[number, number | null, number | null]> = [
    [100, 1001, 109.12],
    [100, 1002, 117.8],
    [59.99, 1001, 65.46],
    [59.99, 1002, 70.67],
    [1234.56, 1001, 1347.15],
    [0.01, 1002, 0.01],
    [0, 1001, null],
    [-5, 1001, null],
    [100, 1000, null],
    [100, null, null],
    [33.335, 1001, 36.38],
    [12.5, 1002, 14.73],
  ];
  it.each(cases)("PRICEW %s, UTBL02 %s → %s", (priceW, utbl02, expected) => {
    expect(calculateMilwaukee1364PriceR02(priceW, utbl02)).toBe(expected);
  });
});

describe("priceWFor (ίδιο με το HDCtool)", () => {
  const base = { suggestedRatio: null, markupPct: null, manualPriceW: null };
  it.each([
    [{ ...base, mode: "SUGGESTED" as const, costNet: 60, suggestedRatio: 5 / 3 }, 100],
    [{ ...base, mode: "SUGGESTED" as const, costNet: 60 }, null],
    [{ ...base, mode: "MARKUP" as const, costNet: 47.13, markupPct: 66.67 }, 78.55],
    [{ ...base, mode: "MARKUP" as const, costNet: 47.13 }, null],
    [{ ...base, mode: "MANUAL" as const, costNet: 10, manualPriceW: 123.456 }, 123.46],
    [{ ...base, mode: "MANUAL" as const, costNet: 10, manualPriceW: 0 }, null],
    [{ ...base, mode: "MARKUP" as const, costNet: 0, markupPct: 50 }, null],
    [{ ...base, mode: "SUGGESTED" as const, costNet: 19.99, suggestedRatio: 4 / 3 }, 26.65],
  ])("%o → %s", (input, expected) => {
    expect(priceWFor(input)).toBe(expected);
  });
});

describe("eshopPriceWithVat, marginPct, ratioLabel", () => {
  it("τιμή eshop μόνο με θετική PRICEW", () => {
    expect(eshopPriceWithVat(100, 1001)).toBe(109.12);
    expect(eshopPriceWithVat(null, 1001)).toBeNull();
    expect(eshopPriceWithVat(0, 1002)).toBeNull();
  });

  it("περιθώριο επί της PRICEW με ένα δεκαδικό", () => {
    expect(marginPct(100, 60)).toBe(40);
    expect(marginPct(78.55, 47.13)).toBe(40);
    expect(marginPct(26.65, 19.99)).toBe(25);
    expect(marginPct(null, 10)).toBeNull();
  });

  it("λόγος με τρία δεκαδικά και ελληνική υποδιαστολή", () => {
    expect(ratioLabel(100, 60, 1001)).toBe("×1,667 · 1001");
    expect(ratioLabel(26.65, 19.99, 1002)).toBe("×1,333 · 1002");
    expect(ratioLabel(100, 0, 1001)).toBeNull();
    expect(ratioLabel(null, 60, 1001)).toBeNull();
  });
});
