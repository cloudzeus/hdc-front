import { describe, expect, it, vi } from "vitest";

// The intake body is pure; the module's database and HDCtool imports are not needed.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/hdctool/client", () => ({ hdctoolRequest: vi.fn() }));

import { Prisma } from "@/generated/prisma/client";
import { buildIntakeBody } from "@/lib/orders/send-to-erp";

const d = (v: string) => new Prisma.Decimal(v);

const order = {
  id: "o1",
  orderNumber: "HDC-20260929-0001",
  status: "PAID",
  paymentStatus: "PAID",
  email: "buyer@example.com",
  phone: "6900000000",
  firstName: "Νίκος",
  lastName: "Παπάς",
  shipLine1: "Οδός 1",
  shipLine2: null,
  shipCity: "Πειραιάς",
  shipPostcode: "18545",
  shipRegion: null,
  shipCountry: "GR",
  wantsInvoice: false,
  companyName: null,
  vatNumber: null,
  taxOffice: null,
  companyTrade: null,
  billLine1: null,
  billCity: null,
  billPostcode: null,
  shippingMethod: "courier",
  paymentMethod: "bank",
  vivaPaymentMethodId: null,
  notes: null,
  subtotalNet: d("100.00"),
  subtotalGross: d("124.00"),
  shippingNet: d("0.00"),
  shippingGross: d("0.00"),
  paymentFeeNet: d("0.00"),
  paymentFeeGross: d("0.00"),
  vatAmount: d("24.00"),
  totalGross: d("124.00"),
  vivaOrderCode: null,
  vivaTransactionId: null,
  paidAt: null,
  erpTrdr: null,
  lines: [],
} as unknown as Parameters<typeof buildIntakeBody>[0];

describe("buildIntakeBody — the SoftOne document of an HDC order", () => {
  it("sends the Magento HDC store's series, channel marker and shipment", () => {
    const body = buildIntakeBody(order) as Record<string, unknown>;
    expect(body.erpSeries).toBe(5021);
    expect(body.erpUftb01).toBe(102);
    expect(body.erpShipment).toBe(111);
  });

  it("leaves the payment code to HDCtool, which reads paymentMethod", () => {
    const body = buildIntakeBody(order) as Record<string, unknown>;
    expect(body).not.toHaveProperty("erpPayment");
    expect(body.paymentMethod).toBe("bank");
  });
});
