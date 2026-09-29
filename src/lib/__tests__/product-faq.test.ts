import { describe, expect, it } from "vitest";
import { productFaq, type FaqProduct } from "@/lib/seo/product-faq";

const product = (over: Partial<FaqProduct> = {}): FaqProduct => ({
  name: "ΔΡΑΠΑΝΟ M18 FPD3-0X",
  sku: "4933479859",
  brandName: null,
  inStock: false,
  supplierAvailable: false,
  qty: 0,
  guaranteeMonths: null,
  priceGross: null,
  specs: [],
  ...over,
});

const availabilityAnswer = (p: FaqProduct) => productFaq(p)[0].a;

describe("productFaq — the availability answer follows the rule", () => {
  it("our stock: in stock, no number", () => {
    const a = availabilityAnswer(product({ inStock: true, qty: 7 }));
    expect(a).toContain("σε απόθεμα");
    expect(a).not.toMatch(/\b7\b/);
  });
  it("the last piece is said", () => {
    expect(availabilityAnswer(product({ inStock: true, qty: 1 }))).toContain("τελευταίο τεμάχιο");
  });
  it("the supplier's: 3–5 working days", () => {
    expect(availabilityAnswer(product({ supplierAvailable: true }))).toContain("3–5 εργάσιμες");
  });
  it("neither: delivery in 1–3 working days, not «κατόπιν παραγγελίας»", () => {
    const a = availabilityAnswer(product());
    expect(a).toContain("1–3 εργάσιμες");
    expect(a).not.toContain("κατόπιν παραγγελίας");
  });
});
