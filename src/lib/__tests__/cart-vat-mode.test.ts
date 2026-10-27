import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearDhlQuoteCache } from "@/lib/shipping/courier-quote";

/**
 * VAT mode in the basket totals (EU sales, task B1).
 *
 * "standard" is today's cart, bit for bit. "intra_eu_exempt" (a company with a
 * valid VIES result) removes VAT from lines, shipping and the payment fee.
 * Free shipping over the net threshold is a Greek promise: abroad, DHL is
 * always charged.
 */

const request = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/hdctool/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hdctool/client")>()),
  hdctoolRequest: request,
}));

const { computeTotals } = await import("@/lib/cart/cart");

// 200 net at 24% + 200 net at 13% = 400 net.
const mixed = [
  { quantity: 2, weight: 1.2, width: 10, length: 20, height: 10, lineNet: 200, lineGross: 248, unitListNet: null, vatRate: 24 },
  { quantity: 1, weight: 1.2, width: 10, length: 20, height: 10, lineNet: 200, lineGross: 226, unitListNet: null, vatRate: 13 },
] as unknown as Parameters<typeof computeTotals>[0];

const small = [
  { quantity: 1, weight: 1.2, width: 10, length: 20, height: 10, lineNet: 50, lineGross: 62, unitListNet: null, vatRate: 24 },
] as unknown as Parameters<typeof computeTotals>[0];

const dhlAnswer = {
  success: true,
  carrier: "DHL",
  productCode: "U",
  productName: "EXPRESS WORLDWIDE EU",
  netAmount: 31.4,
  currency: "EUR",
  transitDays: 3,
  source: "dhl-mock",
};

const acsAnswer = {
  success: true,
  quote: { stationId: "Π", area: "", remote: false, basicNet: 3, extrasNet: 0, totalNet: 3, vatAmount: 0.72, totalGross: 3.72, weightKg: 2.4 },
};

beforeEach(() => {
  request.mockReset();
  clearDhlQuoteCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("computeTotals vat mode", () => {
  it("is unchanged with no options, with {} and with vatMode standard", async () => {
    request.mockResolvedValue(acsAnswer);
    const bare = await computeTotals(small, "courier", "card", "18545");
    // Under the threshold: 3.00 net postage at 24%.
    expect(bare).toMatchObject({
      subtotalNet: 50,
      subtotalGross: 62,
      shippingNet: 3,
      shippingGross: 3.72,
      paymentFeeNet: 0,
      vatAmount: 12.72,
      totalGross: 65.72,
    });
    expect(await computeTotals(small, "courier", "card", "18545", undefined, {})).toEqual(bare);
    expect(
      await computeTotals(small, "courier", "card", "18545", undefined, { vatMode: "standard" }),
    ).toEqual(bare);
  });

  it("still ships free over the threshold in Greece, exactly as today", async () => {
    request.mockResolvedValue(acsAnswer);
    const totals = await computeTotals(mixed, "courier", "card", "18545", undefined, { vatMode: "standard" });
    expect(totals.shippingNet).toBe(0);
    expect(totals.freeShippingReached).toBe(true);
  });

  it("exempt: every gross equals its net, VAT is zero (lines at 24% and 13%, shipping, fee)", async () => {
    request.mockResolvedValue(dhlAnswer);
    const totals = await computeTotals(
      mixed,
      "dhl",
      "card",
      "10115",
      { country: "DE", city: "Berlin" },
      { vatMode: "intra_eu_exempt" },
    );
    expect(totals.subtotalNet).toBe(400);
    expect(totals.subtotalGross).toBe(400);
    expect(totals.shippingNet).toBe(31.4);
    expect(totals.shippingGross).toBe(31.4);
    expect(totals.paymentFeeGross).toBe(totals.paymentFeeNet);
    expect(totals.vatAmount).toBe(0);
    expect(totals.totalGross).toBe(431.4);
  });

  it("exempt: a payment fee carries no VAT either", async () => {
    // No payment method has a fee today; prove the path by giving one.
    const options = await import("@/lib/cart/options");
    const original = options.PAYMENT_METHODS[0].feeNet;
    (options.PAYMENT_METHODS[0] as { feeNet: number }).feeNet = 2.5;
    try {
      request.mockResolvedValue(dhlAnswer);
      const totals = await computeTotals(
        mixed,
        "dhl",
        "card",
        "10115",
        { country: "DE", city: "Berlin" },
        { vatMode: "intra_eu_exempt" },
      );
      expect(totals.paymentFeeNet).toBe(2.5);
      expect(totals.paymentFeeGross).toBe(2.5);
      expect(totals.vatAmount).toBe(0);
      expect(totals.totalGross).toBe(433.9);
    } finally {
      (options.PAYMENT_METHODS[0] as { feeNet: number }).feeNet = original;
    }
  });

  it("a DE cart with net 400 still pays DHL, in standard and in exempt mode", async () => {
    request.mockResolvedValue(dhlAnswer);
    const to = { country: "DE", city: "Berlin" };
    const standard = await computeTotals(mixed, "dhl", "card", "10115", to, { vatMode: "standard" });
    expect(standard.shippingNet).toBe(31.4);
    expect(standard.shippingGross).toBe(38.94);
    const exempt = await computeTotals(mixed, "dhl", "card", "10115", to, { vatMode: "intra_eu_exempt" });
    expect(exempt.shippingNet).toBe(31.4);
    expect(exempt.shippingGross).toBe(31.4);
  });

  it("abroad is never free even if the method says it could be (ACS courier to Cyprus)", async () => {
    request.mockResolvedValue(acsAnswer);
    const totals = await computeTotals(mixed, "courier", "card", "1010", { country: "CY", city: "Λευκωσία" });
    expect(totals.shippingNet).toBe(3);
  });

  it("never reports free shipping as reached abroad (CY, DE) — only in Greece", async () => {
    request.mockResolvedValue(acsAnswer);
    const cy = await computeTotals(mixed, "courier", "card", "1010", { country: "CY", city: "Λευκωσία" });
    expect(cy.subtotalNet).toBeGreaterThanOrEqual(150);
    expect(cy.freeShippingReached).toBe(false);
    request.mockResolvedValue(dhlAnswer);
    const de = await computeTotals(mixed, "dhl", "card", "10115", { country: "DE", city: "Berlin" });
    expect(de.freeShippingReached).toBe(false);
    request.mockResolvedValue(acsAnswer);
    const gr = await computeTotals(mixed, "courier", "card", "18545");
    expect(gr.freeShippingReached).toBe(true);
  });

  it("uses the given shipping quote and its VAT rate instead of quoting", async () => {
    const to = { country: "DE", city: "Berlin" };
    const standard = await computeTotals(mixed, "dhl", "card", "10115", to, {
      shipping: { net: 40, vatRate: 19 },
    });
    expect(request).not.toHaveBeenCalled();
    // The given price replaces the courier's quote, so there is no postage detail.
    expect(standard.postage).toBeNull();
    expect(standard.shippingNet).toBe(40);
    expect(standard.shippingGross).toBe(47.6);
    const exempt = await computeTotals(mixed, "dhl", "card", "10115", to, {
      vatMode: "intra_eu_exempt",
      shipping: { net: 40, vatRate: 19 },
    });
    expect(exempt.shippingGross).toBe(40);
    expect(exempt.vatAmount).toBe(0);
  });

  it("collection stays free whatever shipping is given", async () => {
    const totals = await computeTotals(
      mixed,
      "pickup",
      "card",
      "10115",
      { country: "DE" },
      { shipping: { net: 40, vatRate: 19 } },
    );
    expect(totals.shippingNet).toBe(0);
  });
});
