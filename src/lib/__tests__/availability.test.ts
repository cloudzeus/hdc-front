import { describe, expect, it } from "vitest";
import { availabilityOf, isLastPiece, orderAvailability } from "@/lib/catalog/availability";

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
});
