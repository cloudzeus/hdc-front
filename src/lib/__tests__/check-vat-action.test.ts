import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HdctoolError } from "@/lib/hdctool/client";
import { VatCheckLimiter } from "@/lib/eu-sales/vat-check-limit";

/**
 * The checkout's VIES check (EU sales, B3): the format first and no call for
 * a wrong one, 10 checks per cart in 10 minutes, and the answer remembered in
 * a cookie for the summary — which «Ιδιώτης» and another country clear.
 */

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  checkEuVat: vi.fn(),
  token: vi.fn(async (): Promise<string | null> => "cart-1"),
  headers: new Headers({ "x-real-ip": "203.0.113.7" }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar.has(name) ? { value: mocks.jar.get(name) } : undefined),
    set: (name: string, value: string) => mocks.jar.set(name, value),
    delete: (name: string) => mocks.jar.delete(name),
  }),
  headers: async () => mocks.headers,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/cart/cart", () => ({ getCartToken: mocks.token }));
vi.mock("@/lib/eu-sales/hdctool-eu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/eu-sales/hdctool-eu")>()),
  checkEuVat: mocks.checkEuVat,
}));

const { checkVatForCheckout } = await import("@/lib/eu-sales/check-vat-action");
const { EU_BUYER_COOKIE, parseBuyer } = await import("@/lib/eu-sales/buyer-cookie");

const stored = () => parseBuyer(mocks.jar.get(EU_BUYER_COOKIE));
const valid = () => ({
  status: "valid",
  name: "SCHMIDT GMBH",
  consultationNumber: "WAPI1",
  checkedAt: new Date().toISOString(),
  message: "",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jar.clear();
  process.env.EU_SALES_ENABLED = "true";
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.checkEuVat.mockImplementation(async () => valid());
});

afterEach(() => {
  delete process.env.EU_SALES_ENABLED;
});

describe("checkVatForCheckout", () => {
  it("flag off: does nothing", async () => {
    delete process.env.EU_SALES_ENABLED;
    expect(await checkVatForCheckout({ country: "DE", customerType: "company", vat: "DE123456789" })).toEqual({
      status: null,
      name: null,
      vat: null,
    });
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
    expect(mocks.jar.size).toBe(0);
  });

  it("valid: normalised, asked once, remembered for the summary", async () => {
    const result = await checkVatForCheckout({ country: "DE", customerType: "company", vat: "de 123.456.789" });
    expect(result).toEqual({ status: "valid", name: "SCHMIDT GMBH", vat: "DE123456789" });
    expect(mocks.checkEuVat).toHaveBeenCalledWith("DE123456789", "DE");
    expect(stored()).toMatchObject({ country: "DE", customerType: "company", vat: "DE123456789", vies: { status: "valid" } });
    // The same number again today: no second call.
    await checkVatForCheckout({ country: "DE", customerType: "company", vat: "DE123456789" });
    expect(mocks.checkEuVat).toHaveBeenCalledTimes(1);
  });

  it("a prefix of another country: wrong format, no VIES call", async () => {
    const result = await checkVatForCheckout({ country: "DE", customerType: "company", vat: "ATU12345678" });
    expect(result.status).toBe("invalid_format");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
  });

  it("«Ιδιώτης» after a valid check forgets the VIES answer", async () => {
    await checkVatForCheckout({ country: "DE", customerType: "company", vat: "DE123456789" });
    await checkVatForCheckout({ country: "DE", customerType: "individual" });
    expect(stored()).toMatchObject({ customerType: "individual", vies: null });
  });

  it("Greece clears the buyer altogether", async () => {
    await checkVatForCheckout({ country: "DE", customerType: "company", vat: "DE123456789" });
    await checkVatForCheckout({ country: "GR", customerType: "company", vat: "EL099095556" });
    expect(mocks.jar.has(EU_BUYER_COOKIE)).toBe(false);
    expect(mocks.checkEuVat).toHaveBeenCalledTimes(1);
  });

  it("HDCtool 401 is unavailable, not a crash", async () => {
    mocks.checkEuVat.mockRejectedValue(new HdctoolError("x", 401, "/api/public/vat/check"));
    const result = await checkVatForCheckout({ country: "DE", customerType: "company", vat: "DE123456789" });
    expect(result.status).toBe("unavailable");
  });

  it("a new cart cookie does not buy new checks: 20 per client IP in 10 minutes (R11-I3)", async () => {
    mocks.headers = new Headers({ "x-real-ip": "198.51.100.9" });
    mocks.checkEuVat.mockImplementation(async () => ({ ...valid(), status: "invalid" }));
    for (let i = 0; i < 20; i++) {
      mocks.token.mockResolvedValueOnce(`rotated-${i}`);
      const r = await checkVatForCheckout({ country: "DE", customerType: "company", vat: `DE1234567${String(i).padStart(2, "0")}` });
      expect(r.status).toBe("invalid");
    }
    mocks.token.mockResolvedValueOnce("rotated-new");
    const over = await checkVatForCheckout({ country: "DE", customerType: "company", vat: "DE999999999" });
    expect(over.status).toBe("rate_limited");
    expect(mocks.checkEuVat).toHaveBeenCalledTimes(20);
    // Another address is not affected.
    mocks.headers = new Headers({ "x-real-ip": "198.51.100.10" });
    mocks.token.mockResolvedValueOnce("other");
    expect((await checkVatForCheckout({ country: "DE", customerType: "company", vat: "DE888888888" })).status).toBe("invalid");
  });

  it("at most 10 VIES calls per cart in 10 minutes", async () => {
    mocks.headers = new Headers({ "x-real-ip": "192.0.2.44" });
    mocks.token.mockResolvedValue("cart-limit");
    mocks.checkEuVat.mockImplementation(async () => ({ ...valid(), status: "invalid" }));
    for (let i = 0; i < 10; i++) {
      const r = await checkVatForCheckout({ country: "DE", customerType: "company", vat: `DE12345678${i}` });
      expect(r.status).toBe("invalid");
    }
    const over = await checkVatForCheckout({ country: "DE", customerType: "company", vat: "DE999999999" });
    expect(over.status).toBe("rate_limited");
    expect(mocks.checkEuVat).toHaveBeenCalledTimes(10);
  });
});

describe("VatCheckLimiter", () => {
  it("lets 10 through per key, then refuses until the window has passed", () => {
    const limiter = new VatCheckLimiter(10, 600_000);
    for (let i = 0; i < 10; i++) expect(limiter.take("a", 1000 + i)).toBe(true);
    expect(limiter.take("a", 2000)).toBe(false);
    expect(limiter.take("b", 2000)).toBe(true);
    expect(limiter.take("a", 1000 + 600_000)).toBe(true);
  });
});

describe("parseBuyer", () => {
  it("refuses Greece, Cyprus and garbage", () => {
    expect(parseBuyer(JSON.stringify({ country: "GR", customerType: "company" }))).toBeNull();
    expect(parseBuyer(JSON.stringify({ country: "CY", customerType: "company" }))).toBeNull();
    expect(parseBuyer("{nope")).toBeNull();
  });

  it("an individual never carries a VIES answer", () => {
    const b = parseBuyer(
      JSON.stringify({ country: "DE", customerType: "individual", vat: "DE1", vies: { status: "valid", checkedAt: "x" } }),
    );
    expect(b).toEqual({ country: "DE", customerType: "individual", vat: null, vies: null });
  });
});
