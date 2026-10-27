import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Re-pricing an unpaid order's postage: free over the net threshold is a
 * Greek promise, the same rule as the cart.
 */

const mocks = vi.hoisted(() => ({
  order: vi.fn(),
  quote: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findUnique: mocks.order },
    product: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/shipping/acs-live", () => ({
  quoteLivePostage: mocks.quote,
  isUnserviceable: () => false,
}));
vi.mock("@/lib/mail/postage-correction-email", () => ({ sendPostageCorrectionEmail: vi.fn() }));

const { previewPostageCorrection } = await import("@/lib/orders/postage-correction");

const order = (shipCountry: string, subtotalNet: number) => ({
  id: "o1",
  orderNumber: "A-1",
  paymentStatus: "PENDING",
  status: "PENDING_PAYMENT",
  requestStatus: null,
  shippingMethod: "courier",
  shipCountry,
  shipPostcode: "18545",
  subtotalNet,
  subtotalGross: subtotalNet * 1.24,
  paymentFeeNet: 0,
  paymentFeeGross: 0,
  shippingNet: 100,
  shippingGross: 124,
  vatAmount: 0,
  totalGross: 0,
  shippingQuote: null,
  lines: [],
});

beforeEach(() => {
  mocks.order.mockReset();
  mocks.quote.mockReset();
  mocks.quote.mockResolvedValue({
    source: "acs",
    totalNet: 3,
    chargeableKg: 2.4,
    actualKg: 2.4,
    volumetricKg: 1,
    zoneLabel: "Ηπειρωτική Ελλάδα",
  });
});

describe("previewPostageCorrection free shipping", () => {
  it("Greece over the threshold is free, as before", async () => {
    mocks.order.mockResolvedValue(order("GR", 200));
    const result = await previewPostageCorrection("A-1");
    expect(result).toMatchObject({ ok: true, preview: { after: { shippingNet: 0, freeShipping: true } } });
  });

  it("Greece under the threshold pays the quote", async () => {
    mocks.order.mockResolvedValue(order("GR", 50));
    const result = await previewPostageCorrection("A-1");
    expect(result).toMatchObject({ ok: true, preview: { after: { shippingNet: 3, freeShipping: false } } });
  });

  it("Cyprus is not re-priced here at all (and never free)", async () => {
    mocks.order.mockResolvedValue(order("CY", 200));
    const result = await previewPostageCorrection("A-1");
    expect(result.ok).toBe(false);
    expect(mocks.quote).not.toHaveBeenCalled();
  });
});
