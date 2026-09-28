import { describe, expect, it } from "vitest";
import { articleNumber, customerSince, statusChip } from "@/lib/account/order-view";

describe("statusChip", () => {
  it("words the courier statuses", () => {
    expect(statusChip({ status: "SHIPPED", shippingMethod: "courier" })).toEqual({ key: "shipped", tone: "ship" });
    expect(statusChip({ status: "DELIVERED", shippingMethod: "courier" })).toEqual({ key: "delivered", tone: "del" });
    expect(statusChip({ status: "PENDING_PAYMENT", shippingMethod: "courier" })).toEqual({
      key: "pending_payment",
      tone: "pay",
    });
    expect(statusChip({ status: "CONFIRMED", shippingMethod: "express" })).toEqual({ key: "confirmed", tone: "conf" });
  });

  it("says collected, not delivered, for a pickup", () => {
    expect(statusChip({ status: "DELIVERED", shippingMethod: "pickup" }).key).toBe("collected");
    expect(statusChip({ status: "SHIPPED", shippingMethod: "pickup" }).key).toBe("ready");
  });

  it("greys out what did not happen", () => {
    expect(statusChip({ status: "CANCELLED", shippingMethod: "courier" }).tone).toBe("off");
    expect(statusChip({ status: "FAILED", shippingMethod: "courier" }).tone).toBe("off");
  });
});

describe("customerSince", () => {
  const august = new Date("2026-08-14T10:00:00Z");

  it("is the Greek accusative, in capitals without accents", () => {
    expect(customerSince(august, "el")).toBe("ΑΥΓΟΥΣΤΟ 2026");
    expect(customerSince(new Date("2026-05-02T10:00:00Z"), "el")).toBe("ΜΑΙΟ 2026");
  });

  it("speaks English and Italian", () => {
    expect(customerSince(august, "en")).toBe("AUGUST 2026");
    expect(customerSince(august.toISOString(), "it")).toBe("AGOSTO 2026");
  });
});

describe("articleNumber", () => {
  it("reads the number on the box from the name", () => {
    expect(articleNumber("ΓΩΝΙΑΚΟΣ ΤΡΟΧΟΣ M18 FSAG125XB-0X FUEL 4933478429", "21191000001")).toBe("4933478429");
    expect(articleNumber("ΜΠΑΤΑΡΙΑ 18V 8,0AH M18 B8 4932471070 MILWAUKEE", "x")).toBe("4932471070");
  });

  it("falls back to the line's code", () => {
    expect(articleNumber("ΚΑΤΣΑΒΙΔΙ ΙΣΙΟ", "21191000001")).toBe("21191000001");
  });
});
