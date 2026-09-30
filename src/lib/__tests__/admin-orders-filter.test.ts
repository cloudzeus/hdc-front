import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { FILTERS, whereFor } from "@/lib/admin/orders";

describe("orders filter «Από προμηθευτή»", () => {
  it("is offered after «Εκτός ERP»", () => {
    expect(FILTERS.map((f) => f.id)).toEqual(["all", "erp-pending", "supplier", "unpaid", "to-ship", "shipped"]);
    expect(FILTERS.find((f) => f.id === "supplier")?.label).toBe("Από προμηθευτή");
  });
  it("selects orders frozen as supplier orders", () => {
    expect(whereFor("supplier", "")).toMatchObject({ supplierOrder: true });
  });
  it("leaves the other filters unchanged", () => {
    expect(whereFor("erp-pending", "")).toMatchObject({ paymentStatus: "PAID", erpPushedAt: null });
  });
});
