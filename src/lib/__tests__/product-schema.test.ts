import { describe, expect, it } from "vitest";
import { SUPPLIER_HANDLING_DAYS } from "@/lib/catalog/availability";
import { shippingDetails } from "@/lib/seo/product-schema";

/**
 * The offer's delivery promise has to match its availability: the supplier's
 * stock is InStock for Google, but it leaves in 3–5 working days, not today.
 */
describe("shippingDetails — handling time follows availability", () => {
  const handling = (a: "stock" | "supplier" | "order") => shippingDetails("el", a).deliveryTime.handlingTime;

  it("our stock leaves the same or the next day", () => {
    expect(handling("stock")).toMatchObject({ minValue: 0, maxValue: 1, unitCode: "DAY" });
  });
  it("the supplier's leaves in 3–5 days", () => {
    expect(SUPPLIER_HANDLING_DAYS).toEqual({ min: 3, max: 5 });
    expect(handling("supplier")).toMatchObject({ minValue: 3, maxValue: 5, unitCode: "DAY" });
  });
  it("transit is the same either way", () => {
    expect(shippingDetails("el", "supplier").deliveryTime.transitTime).toEqual(
      shippingDetails("el", "stock").deliveryTime.transitTime,
    );
  });
});
