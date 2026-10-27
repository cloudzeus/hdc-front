import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { FILTERS, SUPPLIER_OPEN_WHERE, whereFor } from "@/lib/admin/orders";

describe("orders filter «Από προμηθευτή»", () => {
  it("is offered after «Εκτός ERP»", () => {
    expect(FILTERS.map((f) => f.id)).toEqual([
      "all",
      "erp-pending",
      "supplier",
      "supplier-open",
      "unpaid",
      "to-ship",
      "shipped",
      "requests",
    ]);
    expect(FILTERS.find((f) => f.id === "supplier")?.label).toBe("Από προμηθευτή");
    expect(FILTERS.find((f) => f.id === "supplier-open")?.label).toBe("Από προμηθευτή · ανοιχτές");
  });
  it("selects orders frozen as supplier orders", () => {
    expect(whereFor("supplier", "")).toMatchObject({ supplierOrder: true });
  });
  it("«ανοιχτές» are the paid supplier orders not yet shipped, as the dashboard card counts them", () => {
    expect(whereFor("supplier-open", "")).toEqual({ supplierOrder: true, paymentStatus: "PAID", shippedAt: null });
    expect(whereFor("supplier-open", "")).toEqual(SUPPLIER_OPEN_WHERE);
  });
  it("leaves the other filters unchanged", () => {
    expect(whereFor("erp-pending", "")).toMatchObject({ paymentStatus: "PAID", erpPushedAt: null });
  });
});

describe("orders filter «Αιτήματα» (back-order requests)", () => {
  it("lists every request, and «Απλήρωτες» leaves out requests nobody owes money for yet", () => {
    expect(FILTERS.find((f) => f.id === "requests")?.label).toBe("Αιτήματα");
    expect(whereFor("requests", "")).toEqual({ requestStatus: { not: null } });
    expect(whereFor("unpaid", "")).toEqual({
      paymentStatus: { in: ["PENDING", "FAILED"] },
      AND: [{ OR: [{ requestStatus: null }, { requestStatus: "ACCEPTED" }] }],
    });
  });
});
