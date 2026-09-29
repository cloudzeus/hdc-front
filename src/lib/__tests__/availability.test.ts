import { describe, expect, it } from "vitest";
import {
  availabilityLabelKey,
  availabilityOf,
  isLastPiece,
  lineAvailability,
  merchantAvailability,
  schemaOrgAvailability,
  AVAILABILITY_LABELS_EL,
  orderAvailability,
} from "@/lib/catalog/availability";

describe("availabilityOf", () => {
  it("our stock wins", () => {
    expect(availabilityOf({ inStock: true, supplierAvailable: true })).toBe("stock");
  });
  it("supplier stock when we have none", () => {
    expect(availabilityOf({ inStock: false, supplierAvailable: true })).toBe("supplier");
  });
  it("on order when neither has it", () => {
    expect(availabilityOf({ inStock: false, supplierAvailable: false })).toBe("order");
  });
  it("treats a missing supplier flag as false", () => {
    expect(availabilityOf({ inStock: false })).toBe("order");
  });
});

describe("isLastPiece", () => {
  it("only exactly one", () => {
    expect(isLastPiece(1)).toBe(true);
    expect(isLastPiece(2)).toBe(false);
    expect(isLastPiece(0)).toBe(false);
    expect(isLastPiece(null)).toBe(false);
  });
});

describe("orderAvailability", () => {
  it("one supplier line makes the whole order supplier", () => {
    expect(orderAvailability(["stock", "supplier", "stock"])).toBe("supplier");
  });
  it("all stock stays stock", () => {
    expect(orderAvailability(["stock", "stock"])).toBe("stock");
  });
  it("otherwise on order", () => {
    expect(orderAvailability(["stock", "order"])).toBe("order");
  });
  it("supplier outranks on order", () => {
    expect(orderAvailability(["order", "supplier"])).toBe("supplier");
  });
  it("an empty order promises nothing extra: stock", () => {
    expect(orderAvailability([])).toBe("stock");
  });
});

describe("availabilityLabelKey", () => {
  it("our stock, no number", () => {
    expect(availabilityLabelKey("stock", 5)).toBe("se_apothema");
    expect(availabilityLabelKey("stock", 0)).toBe("se_apothema");
    expect(availabilityLabelKey("stock", null)).toBe("se_apothema");
  });
  it("the last piece only at exactly one", () => {
    expect(availabilityLabelKey("stock", 1)).toBe("teleftaio");
  });
  it("the supplier's, whatever our quantity", () => {
    expect(availabilityLabelKey("supplier", 1)).toBe("diathesimo_3_5");
    expect(availabilityLabelKey("supplier", 0)).toBe("diathesimo_3_5");
  });
  it("neither", () => {
    expect(availabilityLabelKey("order", 1)).toBe("paradosi_1_3");
  });
});

describe("lineAvailability — a cart line", () => {
  const line = (inStock: boolean, supplierAvailable: boolean, qty: number, quantity: number) => ({
    inStock,
    supplierAvailable,
    qty,
    quantity,
  });
  it("within our stock is stock", () => {
    expect(lineAvailability(line(true, true, 3, 3))).toBe("stock");
  });
  it("more than our stock, the supplier has the rest: supplier", () => {
    expect(lineAvailability(line(true, true, 2, 3))).toBe("supplier");
  });
  it("more than our stock, no supplier: still stock (the rest 1–3 days)", () => {
    expect(lineAvailability(line(true, false, 2, 3))).toBe("stock");
  });
  it("none of ours follows the product", () => {
    expect(lineAvailability(line(false, true, 0, 3))).toBe("supplier");
    expect(lineAvailability(line(false, false, 0, 3))).toBe("order");
  });
});

describe("feeds and structured data", () => {
  it("stock or supplier is in stock; neither stays as before", () => {
    expect(schemaOrgAvailability("stock")).toBe("https://schema.org/InStock");
    expect(schemaOrgAvailability("supplier")).toBe("https://schema.org/InStock");
    expect(schemaOrgAvailability("order")).toBe("https://schema.org/OutOfStock");
    expect(merchantAvailability("stock")).toBe("in_stock");
    expect(merchantAvailability("supplier")).toBe("in_stock");
    expect(merchantAvailability("order")).toBe("out_of_stock");
  });
});

describe("AVAILABILITY_LABELS_EL — Greek-only surfaces (emails)", () => {
  it("has the storefront's words", () => {
    expect(AVAILABILITY_LABELS_EL[availabilityLabelKey("stock", 4)]).toBe("Σε απόθεμα");
    expect(AVAILABILITY_LABELS_EL[availabilityLabelKey("stock", 1)]).toBe("Τελευταίο τεμάχιο");
    expect(AVAILABILITY_LABELS_EL[availabilityLabelKey("supplier", 0)]).toBe("Διαθέσιμο · 3–5 εργάσιμες");
    expect(AVAILABILITY_LABELS_EL[availabilityLabelKey("order", 0)]).toBe("Παράδοση 1–3 εργάσιμες");
  });
});
