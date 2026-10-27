import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HdctoolError } from "@/lib/hdctool/client";
import { clearDhlQuoteCache } from "@/lib/shipping/courier-quote";

/**
 * `placeOrder` with EU_SALES_ENABLED (spec 2026-10-23 §3, task B3).
 *
 * The server decides the VAT: it asks VIES again (through HDCtool) whatever
 * the form believed, re-quotes DHL, prices with `computeTotals` and charges
 * Viva the frozen total — the net when the order is exempt.
 *
 * `checkEuVat` / `quoteDhl` (B2) are stand-ins; `computeTotals`, the schema
 * and `resolveVatMode` are the real ones.
 */

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  orderCreate: vi.fn(),
  getCart: vi.fn(),
  checkEuVat: vi.fn(),
  quoteDhl: vi.fn(),
  createPaymentOrder: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@node-rs/argon2", () => ({ hash: vi.fn() }));
vi.mock("@/lib/mail/order-email", () => ({ sendOrderEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/mail/order-internal-email", () => ({
  sendInternalOrderEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/account/session", () => ({ getCurrentUser: vi.fn(async () => null) }));
vi.mock("@/lib/payment/viva", () => ({
  isVivaConfigured: () => true,
  createPaymentOrder: mocks.createPaymentOrder,
}));
vi.mock("@/lib/requests/service", () => ({ announceNewRequest: vi.fn() }));
vi.mock("@/lib/hdctool/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hdctool/client")>()),
  hdctoolRequest: mocks.request,
}));
vi.mock("@/lib/eu-sales/hdctool-eu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/eu-sales/hdctool-eu")>()),
  checkEuVat: mocks.checkEuVat,
  quoteDhl: mocks.quoteDhl,
}));
vi.mock("@/lib/cart/cart", async () => ({
  ...(await vi.importActual<typeof import("@/lib/cart/cart")>("@/lib/cart/cart")),
  getCartToken: vi.fn(async () => "cart-token"),
  getCart: mocks.getCart,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findFirst: vi.fn(async () => null),
      create: mocks.orderCreate,
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    product: { findMany: vi.fn(async () => []) },
    cartLine: { deleteMany: vi.fn() },
    customer: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

const { placeOrder } = await import("@/lib/checkout/actions");
const { checkoutSchema } = await import("@/lib/checkout/schema");

const line = {
  id: "l1",
  productId: "p1",
  slug: "drapano",
  sku: "4933478",
  name: "M18 FPD3",
  brandName: "Milwaukee",
  image: null,
  quantity: 1,
  weight: 1.2,
  width: 10,
  length: 20,
  height: 10,
  unitNet: 100,
  unitNetFinal: 100,
  discountPercent: 0,
  offerTitle: null,
  offerHref: null,
  unitListNet: null,
  lineNet: 100,
  lineGross: 124,
  vatRate: 24,
  inStock: true,
  availableQty: 10,
  overStock: false,
  availability: "stock",
};

const dhl = {
  ok: true,
  productCode: "U",
  productName: "EXPRESS WORLDWIDE EU",
  netAmount: 31.4,
  vatRate: 24,
  grossAmount: 38.94,
  quotedAt: "2026-10-27T10:00:00.000Z",
  estimatedDeliveryDate: "2026-10-30",
};

const acsAnswer = {
  success: true,
  quote: {
    stationId: "ΗΡ",
    area: "ΗΡΑΚΛΕΙΟ",
    remote: false,
    basicNet: 4.12,
    extrasNet: 0,
    totalNet: 4.12,
    vatAmount: 0.99,
    totalGross: 5.11,
    weightKg: 1.2,
  },
};

const berlin = {
  shipLine1: "Unter den Linden 1",
  shipCity: "Berlin",
  shipPostcode: "10117",
  shipCountry: "DE",
  shippingMethod: "dhl",
};
const heraklion = { shipLine1: "Ιταλίας 12", shipCity: "Ηράκλειο", shipPostcode: "71201" };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  const all = {
    email: "einkauf@example.de",
    phone: "+49 30 1234567",
    firstName: "Anna",
    lastName: "Schmidt",
    shippingMethod: "courier",
    paymentMethod: "card",
    terms: "on",
    locale: "el",
    ...fields,
  };
  for (const [k, v] of Object.entries(all)) data.set(k, v);
  return data;
}

const createdData = () => mocks.orderCreate.mock.calls[0][0].data as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  clearDhlQuoteCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.getCart.mockResolvedValue({
    id: "c1",
    lines: [line],
    totals: {},
    shippingMethod: "courier",
    paymentMethod: "card",
    couponCode: null,
  });
  mocks.orderCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "o1",
    orderNumber: "HDC-1",
    guestToken: "g",
    totalGross: data.totalGross,
  }));
  mocks.createPaymentOrder.mockResolvedValue({ orderCode: "123", checkoutUrl: "https://viva.test/pay" });
  mocks.quoteDhl.mockResolvedValue(dhl);
  mocks.checkEuVat.mockResolvedValue({
    status: "valid",
    name: "SCHMIDT GMBH",
    consultationNumber: "WAPIAAAAZ1",
    checkedAt: new Date().toISOString(),
    message: "",
  });
});

afterEach(() => {
  delete process.env.EU_SALES_ENABLED;
  delete process.env.INTERNATIONAL_SHIPPING_ENABLED;
});

describe("EU_SALES_ENABLED off — GR only, as today", () => {
  it("a posted DE is not honoured: the order is Greek, nobody asks VIES or DHL", async () => {
    mocks.request.mockResolvedValue(acsAnswer);
    await expect(
      placeOrder(
        {},
        form({
          ...heraklion,
          shipCountry: "DE",
          customerType: "company",
          companyName: "SCHMIDT GMBH",
          vatNumber: "DE123456789",
        }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
    expect(mocks.quoteDhl).not.toHaveBeenCalled();
    const data = createdData();
    expect(data).not.toHaveProperty("shipCountry");
    expect(data).not.toHaveProperty("billCountry");
    expect(data).not.toHaveProperty("vatMode");
    expect(data.wantsInvoice).toBe(false);
    expect(data.vatNumber).toBeNull();
  });

  it("an address abroad is still refused by the Greek-only rules", async () => {
    const result = await placeOrder({}, form({ ...berlin, shipAdminRegion: "Germany" }));
    expect(result.error).toMatch(/Αποστέλλουμε μόνο εντός Ελλάδας/);
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("the schema keeps the country field to two letters", () => {
    expect(checkoutSchema.safeParse({ shipCountry: "DEU" }).success).toBe(false);
  });
});

describe("EU_SALES_ENABLED on", () => {
  beforeEach(() => {
    process.env.EU_SALES_ENABLED = "true";
  });

  it("DE company: VIES re-checked on the server, exempt, totalGross = net, Viva charged the net", async () => {
    await expect(
      placeOrder(
        {},
        form({
          ...berlin,
          customerType: "company",
          companyName: "Schmidt GmbH",
          vatNumber: "de 123 456 789",
          // What a tampered form might post. None of it is read.
          vatMode: "intra_eu_exempt",
          viesValid: "true",
          totalGross: "1.00",
        }),
      ),
    ).rejects.toThrow("REDIRECT https://viva.test/pay");

    expect(mocks.checkEuVat).toHaveBeenCalledWith("DE123456789", "DE");
    expect(mocks.quoteDhl).toHaveBeenCalledWith({ country: "DE", postcode: "10117", city: "Berlin", weightKg: 1.2 });
    const data = createdData();
    expect(data).toMatchObject({
      shipCountry: "DE",
      billCountry: "DE",
      customerType: "company",
      vatMode: "intra_eu_exempt",
      viesValid: true,
      viesName: "SCHMIDT GMBH",
      viesConsultationNumber: "WAPIAAAAZ1",
      wantsInvoice: true,
      companyName: "Schmidt GmbH",
      vatNumber: "DE123456789",
      shippingMethod: "dhl",
      subtotalNet: 100,
      subtotalGross: 100,
      shippingNet: 31.4,
      shippingGross: 31.4,
      vatAmount: 0,
      totalGross: 131.4,
    });
    expect(data.viesCheckedAt).toBeInstanceOf(Date);
    expect(data.shippingQuote).toMatchObject({
      carrier: "DHL",
      productCode: "U",
      netAmount: 31.4,
      vatRate: 24,
      quotedAt: dhl.quotedAt,
    });
    expect(mocks.createPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({ amountGross: 131.4 }));
  });

  it("DE company whose VIES check is from yesterday on the form is checked again; unavailable now → VAT", async () => {
    mocks.checkEuVat.mockResolvedValue({
      status: "unavailable",
      name: null,
      consultationNumber: null,
      checkedAt: null,
      message: "Δεν ήταν δυνατός ο έλεγχος",
    });
    await expect(
      placeOrder({}, form({ ...berlin, customerType: "company", companyName: "Schmidt GmbH", vatNumber: "DE123456789" })),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.checkEuVat).toHaveBeenCalledTimes(1);
    expect(createdData()).toMatchObject({ vatMode: "standard", viesValid: false, totalGross: 162.94 });
  });

  it("a VIES check that throws (HDCtool 400/401) is VAT, never a 500", async () => {
    mocks.checkEuVat.mockRejectedValue(new HdctoolError("/api/public/vat/check failed (401)", 401, "/api/public/vat/check"));
    await expect(
      placeOrder({}, form({ ...berlin, customerType: "company", companyName: "Schmidt GmbH", vatNumber: "DE123456789" })),
    ).rejects.toThrow("REDIRECT");
    expect(createdData()).toMatchObject({ vatMode: "standard", totalGross: 162.94 });
  });

  it("DE individual → 24%, no VIES call, no invoice fields", async () => {
    await expect(
      placeOrder({}, form({ ...berlin, customerType: "individual", vatNumber: "DE123456789", companyName: "X" })),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
    const data = createdData();
    expect(data).toMatchObject({
      customerType: "individual",
      vatMode: "standard",
      wantsInvoice: false,
      vatNumber: null,
      subtotalGross: 124,
      shippingGross: 38.94,
      totalGross: 162.94,
    });
    expect(mocks.createPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({ amountGross: 162.94 }));
  });

  it("a VAT number with another country's prefix is a wrong format: field error, no VIES call", async () => {
    const result = await placeOrder(
      {},
      form({ ...berlin, customerType: "company", companyName: "Schmidt GmbH", vatNumber: "ATU12345678" }),
    );
    expect(result.fieldErrors).toHaveProperty("vatNumber");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("an invalid VAT number may go on with VAT", async () => {
    mocks.checkEuVat.mockResolvedValue({ status: "invalid", name: null, consultationNumber: null, checkedAt: new Date().toISOString(), message: "" });
    await expect(
      placeOrder({}, form({ ...berlin, customerType: "company", companyName: "Schmidt GmbH", vatNumber: "DE123456789" })),
    ).rejects.toThrow("REDIRECT");
    expect(createdData()).toMatchObject({ vatMode: "standard", viesValid: false, totalGross: 162.94 });
  });

  it("DHL cannot price it → the spec's message, and no order", async () => {
    mocks.quoteDhl.mockResolvedValue({ ok: false, reason: "unavailable" });
    const result = await placeOrder(
      {},
      form({ ...berlin, customerType: "company", companyName: "Schmidt GmbH", vatNumber: "DE123456789" }),
    );
    expect(result.error).toBe("Η αποστολή στη χώρα σας δεν είναι διαθέσιμη αυτή τη στιγμή — επικοινωνήστε μαζί μας");
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("DHL refuses the postcode → on the Τ.Κ. field, no order", async () => {
    mocks.quoteDhl.mockResolvedValue({ ok: false, reason: "unserviceable_postcode" });
    const result = await placeOrder({}, form({ ...berlin, customerType: "individual" }));
    expect(result.fieldErrors).toHaveProperty("shipPostcode");
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("GR with «EL 099095556» → the AADE path as today, never VIES, never exempt (Review Focus 5)", async () => {
    mocks.request.mockResolvedValue(acsAnswer);
    await expect(
      placeOrder(
        {},
        form({
          ...heraklion,
          shipCountry: "GR",
          customerType: "company",
          wantsInvoice: "on",
          companyName: "ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ",
          vatNumber: "EL 099095556",
          taxOffice: "Πειραιά",
        }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
    expect(mocks.quoteDhl).not.toHaveBeenCalled();
    const data = createdData();
    expect(data).toMatchObject({
      shipCountry: "GR",
      billCountry: "GR",
      vatMode: "standard",
      wantsInvoice: true,
      vatNumber: "EL 099095556",
      taxOffice: "Πειραιά",
      subtotalGross: 124,
    });
    expect(data.customerType).toBe("company");
  });

  it("Cyprus and the rest of the world are not offered", async () => {
    const cy = await placeOrder({}, form({ shipLine1: "Μακαρίου 1", shipCity: "Λευκωσία", shipPostcode: "1010", shipCountry: "CY" }));
    expect(cy.fieldErrors).toHaveProperty("shipCountry");
    const gb = await placeOrder({}, form({ ...berlin, shipCountry: "GB" }));
    expect(gb.fieldErrors).toHaveProperty("shipCountry");
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("no collection from the shop abroad", async () => {
    const result = await placeOrder({}, form({ ...berlin, shippingMethod: "pickup", customerType: "individual" }));
    expect(result.fieldErrors).toHaveProperty("shippingMethod");
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });
});
