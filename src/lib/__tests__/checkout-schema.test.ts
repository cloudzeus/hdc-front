import { describe, expect, it } from "vitest";
import { SHOP } from "@/config/shop";
import { checkoutSchema, deliveryAddress } from "@/lib/checkout/schema";

/**
 * The HDC checkout asks for the pickup choice BEFORE the address and hides the
 * address when the customer collects from the shop. The server has to agree:
 * no address for pickup, the full address for everything else.
 */
const base = {
  email: "test@example.com",
  phone: "6900000000",
  firstName: "Γιάννης",
  lastName: "Δοκιμής",
  paymentMethod: "card",
  terms: "on",
  locale: "el",
};

const address = {
  shipLine1: "Κ. Μαυρομιχάλη 4",
  shipCity: "Πειραιάς",
  shipPostcode: "18545",
};

describe("checkout schema", () => {
  it("accepts a pickup order with no delivery address", () => {
    const parsed = checkoutSchema.safeParse({ ...base, shippingMethod: "pickup" });
    expect(parsed.success).toBe(true);
  });

  it("stores the shop's address on a pickup order", () => {
    const parsed = checkoutSchema.parse({ ...base, shippingMethod: "pickup", shipLine1: "κάτι" });
    expect(deliveryAddress(parsed)).toMatchObject({
      shipLine1: SHOP.contact.street,
      shipCity: SHOP.contact.city,
      shipPostcode: SHOP.contact.postcode,
      shipLine2: null,
    });
  });

  it.each(["courier", "express"])("requires the address for %s", (shippingMethod) => {
    const parsed = checkoutSchema.safeParse({ ...base, shippingMethod });
    expect(parsed.success).toBe(false);
    const fields = parsed.error!.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["shipLine1", "shipCity", "shipPostcode"]));
  });

  it("keeps the old minimums for a courier address", () => {
    const parsed = checkoutSchema.safeParse({
      ...base,
      shippingMethod: "courier",
      ...address,
      shipPostcode: "185",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error!.issues.map((i) => i.path[0])).toEqual(["shipPostcode"]);
  });

  it("passes a complete courier order through unchanged", () => {
    const parsed = checkoutSchema.parse({ ...base, shippingMethod: "courier", ...address });
    expect(deliveryAddress(parsed)).toMatchObject(address);
  });

  it("does not exempt an unknown method from the address", () => {
    expect(checkoutSchema.safeParse({ ...base, shippingMethod: "PICKUP " }).success).toBe(false);
  });
});
