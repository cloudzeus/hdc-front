import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/hdctool/client", () => ({ hdctoolRequest: vi.fn() }));

import { Prisma } from "@/generated/prisma/client";
import { buildIntakeBody } from "@/lib/orders/send-to-erp";

const d = (v: string) => new Prisma.Decimal(v);

type Body = Record<string, unknown> & { lines: Array<Record<string, unknown>> };

const line = {
  mtrl: 812, xmlCode: null, sku: "4933479860", name: "M18 FPD3", brand: "Milwaukee", quantity: 2,
  unitNet: d("100.00"), discountPercent: d("0.00"), offerTitle: null, unitGross: d("124.00"),
  vatRate: d("24.00"), lineNet: d("200.00"), lineGross: d("248.00"), weightKg: null,
};

const base = {
  id: "o1",
  orderNumber: "HDC-20261027-0001",
  status: "PAID",
  paymentStatus: "PAID",
  email: "buyer@example.com",
  phone: "6900000000",
  firstName: "Hans",
  lastName: "Muller",
  shipLine1: "Hauptstr. 1",
  shipLine2: null,
  shipCity: "Berlin",
  shipPostcode: "10115",
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
  billCountry: "GR",
  customerType: null,
  vatMode: "standard",
  viesConsultationNumber: null,
  viesCheckedAt: null,
  shippingMethod: "courier",
  shippingQuote: null,
  paymentMethod: "bank",
  vivaPaymentMethodId: null,
  notes: null,
  subtotalNet: d("200.00"),
  subtotalGross: d("248.00"),
  shippingNet: d("0.00"),
  shippingGross: d("0.00"),
  paymentFeeNet: d("0.00"),
  paymentFeeGross: d("0.00"),
  vatAmount: d("48.00"),
  totalGross: d("248.00"),
  vivaOrderCode: null,
  vivaTransactionId: null,
  paidAt: null,
  erpTrdr: null,
  requestStatus: null,
  lines: [line],
};

const build = (over: Record<string, unknown> = {}) =>
  buildIntakeBody({ ...base, ...over } as unknown as Parameters<typeof buildIntakeBody>[0]) as unknown as Body;

const exemptDe = {
  shipCountry: "DE",
  billCountry: "DE",
  wantsInvoice: true,
  companyName: "Muller GmbH",
  vatNumber: "DE123456789",
  customerType: "company",
  vatMode: "intra_eu_exempt",
  viesConsultationNumber: "WAPIAAAAY1234567",
  viesCheckedAt: new Date("2026-10-27T09:30:00.000Z"),
  shippingMethod: "dhl",
  shippingQuote: { source: "dhl", carrier: "DHL", productCode: "U", netAmount: 31.4, quotedAt: "2026-10-27T09:29:00.000Z" },
  subtotalGross: d("200.00"),
  shippingNet: d("31.40"),
  shippingGross: d("31.40"),
  vatAmount: d("0.00"),
  totalGross: d("231.40"),
};

describe("buildIntakeBody — Greek order", () => {
  it("adds nothing for a Greek order, whatever the new columns hold", () => {
    const body = build();
    for (const key of ["billCountry", "customerType", "vatMode", "viesConsultationNumber", "viesCheckedAt", "shipping"]) {
      expect(body).not.toHaveProperty(key);
    }
    expect(body.lines[0]).toMatchObject({ vatRate: "24.00", unitGross: "124.00", lineGross: "248.00" });
  });

  it("is the same body as an order that predates the columns", () => {
    const legacy = { ...base } as Record<string, unknown>;
    for (const key of ["billCountry", "customerType", "vatMode", "viesConsultationNumber", "viesCheckedAt"]) delete legacy[key];
    expect(JSON.stringify(build())).toBe(JSON.stringify(build(legacy)));
  });
});

describe("buildIntakeBody — EU orders", () => {
  it("exempt DE company: every line at 0.00, shipping at 0, the VAT number with its prefix", () => {
    const body = build(exemptDe);
    expect(body.lines.every((l) => l.vatRate === "0.00")).toBe(true);
    expect(body.lines[0]).toMatchObject({ unitGross: "100.00", lineGross: "200.00", lineNet: "200.00" });
    expect(body.shipping).toEqual({
      carrier: "DHL",
      productCode: "U",
      netAmount: 31.4,
      vatRate: 0,
      quotedAt: "2026-10-27T09:29:00.000Z",
    });
    expect(body.vatNumber).toBe("DE123456789");
    expect(body).toMatchObject({
      billCountry: "DE",
      customerType: "company",
      vatMode: "intra_eu_exempt",
      viesConsultationNumber: "WAPIAAAAY1234567",
      viesCheckedAt: "2026-10-27T09:30:00.000Z",
    });
  });

  it("an exempt discounted line keeps the discount, its gross is its net", () => {
    const discounted = {
      ...line, unitNet: d("100.00"), discountPercent: d("10.00"), offerTitle: "Offer",
      lineNet: d("180.00"), lineGross: d("223.20"), unitGross: d("111.60"),
    };
    const body = build({ ...exemptDe, lines: [discounted] });
    expect(body.lines[0]).toMatchObject({
      vatRate: "0.00", unitNet: "100.00", discountPercent: "10.00", unitGross: "90.00", lineGross: "180.00",
    });
  });

  it("a consumer abroad is charged VAT: lines at 24, shipping at 24, no VIES fields", () => {
    const body = build({
      shipCountry: "IT", billCountry: "IT", customerType: "individual", vatMode: "standard",
      shippingMethod: "dhl",
      shippingQuote: { carrier: "DHL", productCode: "U", quotedAt: "2026-10-27T09:29:00.000Z" },
      shippingNet: d("31.40"),
    });
    expect(body.lines[0]).toMatchObject({ vatRate: "24.00", lineGross: "248.00" });
    expect(body.shipping).toMatchObject({ carrier: "DHL", vatRate: 24 });
    expect(body).toMatchObject({ billCountry: "IT", customerType: "individual", vatMode: "standard" });
    expect(body).not.toHaveProperty("viesConsultationNumber");
    expect(body).not.toHaveProperty("viesCheckedAt");
  });

  it("a company abroad charged VAT (VIES unavailable) stays at 24", () => {
    const body = build({ ...exemptDe, vatMode: "standard", viesConsultationNumber: null, viesCheckedAt: null });
    expect(body.lines[0]).toMatchObject({ vatRate: "24.00" });
    expect(body.shipping).toMatchObject({ vatRate: 24 });
    expect(body.vatNumber).toBe("DE123456789");
    expect(body).toMatchObject({ vatMode: "standard", customerType: "company" });
  });
});
