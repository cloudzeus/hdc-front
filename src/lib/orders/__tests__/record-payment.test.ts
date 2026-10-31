import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", async () => (await import("@/lib/requests/__tests__/request-fakes")).mockModules.prisma());

const steps: string[] = [];
vi.mock("@/lib/mail/order-email", () => ({
  sendOrderEmail: vi.fn(async (n: string, o?: { trigger?: string }) => (steps.push(`receipt:${n}:${o?.trigger}`), { ok: true })),
}));
vi.mock("@/lib/mail/order-internal-email", () => ({
  sendInternalOrderEmail: vi.fn(async (n: string) => (steps.push(`internal:${n}`), { ok: true })),
}));
vi.mock("@/lib/orders/send-to-erp", () => ({
  syncPaymentToErp: vi.fn(async (n: string) => (steps.push(`hdctool:${n}`), { ok: true })),
  sendOrderToErp: vi.fn(async (n: string) => (steps.push(`softone:${n}`), { ok: true, findoc: 1, fincode: "ΠΑΡΚ1", alreadySent: false })),
}));

import { db, resetFakes } from "@/lib/requests/__tests__/request-fakes";
import { canRecordBankPayment, recordBankPayment } from "@/lib/orders/record-payment";

const base = {
  orderNumber: "HDC-20261028-0001",
  paidAt: new Date("2026-10-30T10:00:00Z"),
  reference: "20261029096786B348",
  note: "αιτιολογία το IBAN",
  amountConfirmed: true,
  actor: "admin:ops@example.test",
};

function seedBankOrder(over: Record<string, unknown> = {}) {
  const order = {
    id: "b1",
    orderNumber: "HDC-20261028-0001",
    status: "CONFIRMED",
    paymentStatus: "PENDING",
    paymentMethod: "bank",
    requestStatus: null,
    totalGross: 1287.96,
    createdAt: new Date("2026-10-28T19:03:14Z"),
    ...over,
  };
  db.orders.push(order as never);
  return order;
}

beforeEach(() => {
  resetFakes();
  steps.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordBankPayment — a deposit Viva did not match", () => {
  it("marks it paid on the credit date, records who and what, then receipt → HDCtool → SoftOne", async () => {
    const order = seedBankOrder();
    const result = await recordBankPayment(base);
    expect(result).toMatchObject({ ok: true, erp: { ok: true, fincode: "ΠΑΡΚ1" }, problems: [] });
    expect(order).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID", paidAt: base.paidAt, paymentMethod: "bank" });
    const note = db.history.at(-1);
    expect(note?.actor).toBe("admin:ops@example.test");
    expect(note?.note).toContain("20261029096786B348");
    expect(note?.note).toContain("1287.96");
    expect(steps).toEqual([
      "receipt:HDC-20261028-0001:payment",
      "internal:HDC-20261028-0001",
      "hdctool:HDC-20261028-0001",
      "softone:HDC-20261028-0001",
    ]);
  });

  it("a card order paid by transfer becomes a bank order, and says so", async () => {
    const order = seedBankOrder({ paymentMethod: "card", status: "PENDING_PAYMENT" });
    await recordBankPayment(base);
    expect(order.paymentMethod).toBe("bank");
    expect(db.history.at(-1)?.note).toContain("card → bank");
  });

  it("refuses without the amount confirmation or a bank reference", async () => {
    seedBankOrder();
    expect(await recordBankPayment({ ...base, amountConfirmed: false })).toMatchObject({ ok: false });
    expect(await recordBankPayment({ ...base, reference: "  " })).toMatchObject({ ok: false });
    expect(steps).toEqual([]);
  });

  it("refuses a future credit date", async () => {
    seedBankOrder();
    const r = await recordBankPayment({ ...base, paidAt: new Date(Date.now() + 86_400_000) });
    expect(r).toMatchObject({ ok: false });
  });

  it("never records a second payment", async () => {
    seedBankOrder({ paymentStatus: "PAID" });
    expect(await recordBankPayment(base)).toEqual({ ok: false, error: "Η παραγγελία είναι ήδη πληρωμένη." });
    expect(steps).toEqual([]);
  });

  it("a back-order request is payable only after the customer accepted the offer", async () => {
    seedBankOrder({ requestStatus: "OFFERED" });
    expect(await recordBankPayment(base)).toMatchObject({ ok: false });
    expect(canRecordBankPayment({ paymentStatus: "PENDING", status: "CONFIRMED", requestStatus: "ACCEPTED" })).toBe(true);
    expect(canRecordBankPayment({ paymentStatus: "PENDING", status: "CANCELLED" })).toBe(false);
  });
});
