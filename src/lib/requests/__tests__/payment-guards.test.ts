import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/prisma", async () => (await import("./request-fakes")).mockModules.prisma());
const { getTransaction, followUps } = vi.hoisted(() => ({
  getTransaction: vi.fn(),
  followUps: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/payment/viva", async () => ({
  ...(await import("./request-fakes")).mockModules.viva(),
  VIVA_STATUS_PAID: "F",
  getTransaction,
}));
vi.mock("@/lib/mail/order-email", () => ({ sendOrderEmail: followUps }));
vi.mock("@/lib/mail/order-internal-email", () => ({ sendInternalOrderEmail: followUps }));
vi.mock("@/lib/mail/payment-failed-email", () => ({ sendPaymentFailedEmail: followUps }));
vi.mock("@/lib/orders/send-to-erp", () => ({ sendOrderToErp: followUps, syncPaymentToErp: followUps }));

import { outside, resetFakes, seedRequest } from "./request-fakes";
import { GET } from "@/app/api/payment/pay/[orderNumber]/route";
import { handleVivaEvent } from "@/lib/payment/viva-webhook";
import { db } from "./request-fakes";

beforeEach(() => {
  resetFakes();
  followUps.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the never-expiring payment link refuses a request that was not accepted", () => {
  it.each(["REQUESTED", "OFFERED", "DECLINED", "EXPIRED", "REJECTED"])("%s → no Viva order", async (status) => {
    seedRequest({ requestStatus: status, guestToken: "g" });
    const req = new Request("https://milwaukeetoolshdc.test/api/payment/pay/HDC-20261013-0002?t=g");
    const res = await GET(Object.assign(req, { nextUrl: new URL(req.url) }) as unknown as NextRequest, {
      params: Promise.resolve({ orderNumber: "HDC-20261013-0002" }),
    });
    expect(res.status).toBe(303);
    expect(outside.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("an ACCEPTED, unpaid request can be paid from the link", async () => {
    seedRequest({ requestStatus: "ACCEPTED", guestToken: "g" });
    const req = new Request("https://milwaukeetoolshdc.test/api/payment/pay/HDC-20261013-0002?t=g");
    await GET(Object.assign(req, { nextUrl: new URL(req.url) }) as unknown as NextRequest, {
      params: Promise.resolve({ orderNumber: "HDC-20261013-0002" }),
    });
    expect(outside.createPaymentOrder).toHaveBeenCalledTimes(1);
  });

});

describe("the Viva webhook never books a payment on a request that was not accepted", () => {
  const post = () =>
    new Request("https://milwaukeetoolshdc.test/api/webhooks/viva", {
      method: "POST",
      body: JSON.stringify({ EventTypeId: 1796, EventData: { TransactionId: "tx-1" } }),
    }) as unknown as NextRequest;

  it("OFFERED → flagged, nothing paid, no follow-ups", async () => {
    seedRequest({ requestStatus: "OFFERED", totalGross: 49.6 });
    getTransaction.mockResolvedValue({ statusId: "F", amount: 49.6, merchantTrns: "HDC-20261013-0002", paymentMethodId: 0 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleVivaEvent(post(), "paymentCreated");
    expect(await res.json()).toEqual({ ok: true, flagged: "request_not_accepted" });
    expect(db.orders[0].paymentStatus).toBe("PENDING");
    expect(followUps).not.toHaveBeenCalled();
  });

  it("ACCEPTED → paid like any order, and the ERP follow-ups run", async () => {
    seedRequest({ requestStatus: "ACCEPTED", totalGross: 49.6 });
    getTransaction.mockResolvedValue({ statusId: "F", amount: 49.6, merchantTrns: "HDC-20261013-0002", paymentMethodId: 0 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await handleVivaEvent(post(), "paymentCreated");
    expect(await res.json()).toEqual({ ok: true, paid: true });
    expect(db.orders[0].paymentStatus).toBe("PAID");
    expect(followUps).toHaveBeenCalled();
  });
});
