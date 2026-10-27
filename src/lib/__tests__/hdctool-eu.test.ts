import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HDCtool's EU-sales surface: the VIES check and the DHL quote
 * (docs/eu-sales). fetch is mocked; the contracts are HDCtool's.
 */

vi.stubEnv("HDCTOOL_API_KEY", "test-key");

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) =>
  new Response(body === undefined ? "not json" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const { checkEuVat, quoteDhl, VIES_UNAVAILABLE_MESSAGE } = await import("@/lib/eu-sales/hdctool-eu");

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("checkEuVat", () => {
  it("posts { vat, country } with the key and maps a valid answer", async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        status: "valid",
        name: "ACME GMBH",
        address: "Berlin",
        consultationNumber: "WAPIAAAA123",
        checkedAt: "2026-10-27T08:00:00.000Z",
        message: "",
      }),
    );
    const result = await checkEuVat("DE123456789", "DE");
    expect(result).toEqual({
      status: "valid",
      name: "ACME GMBH",
      address: "Berlin",
      consultationNumber: "WAPIAAAA123",
      checkedAt: "2026-10-27T08:00:00.000Z",
      message: "",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/public\/vat\/check$/);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toEqual({ vat: "DE123456789", country: "DE" });
  });

  it.each(["invalid", "invalid_format"] as const)("maps %s through", async (status) => {
    fetchMock.mockResolvedValue(
      reply(200, { status, name: null, address: null, consultationNumber: null, checkedAt: null, message: "no" }),
    );
    expect(await checkEuVat("DE1", "DE")).toMatchObject({ status, name: null, consultationNumber: null, message: "no" });
  });

  it("keeps the HDCtool message for unavailable, and falls back to the Greek copy", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, { status: "unavailable", name: null, address: null, consultationNumber: null, checkedAt: null, message: "VIES down" }),
    );
    expect((await checkEuVat("DE123456789", "DE")).message).toBe("VIES down");
    fetchMock.mockResolvedValueOnce(
      reply(200, { status: "unavailable", name: null, address: null, consultationNumber: null, checkedAt: null }),
    );
    const result = await checkEuVat("DE123456789", "DE");
    expect(result.status).toBe("unavailable");
    expect(result.message).toBe(VIES_UNAVAILABLE_MESSAGE);
    expect(VIES_UNAVAILABLE_MESSAGE).toBe(
      "Δεν ήταν δυνατός ο έλεγχος του ΑΦΜ τώρα — δοκιμάστε ξανά σε λίγο ή συνεχίστε με ΦΠΑ",
    );
  });

  it("429 is unavailable, with HDCtool's message when given", async () => {
    fetchMock.mockResolvedValueOnce(reply(429, { status: "unavailable", message: "slow down" }));
    expect(await checkEuVat("DE123456789", "DE")).toMatchObject({ status: "unavailable", message: "slow down" });
    fetchMock.mockResolvedValueOnce(reply(429, {}));
    expect((await checkEuVat("DE123456789", "DE")).message).toBe(VIES_UNAVAILABLE_MESSAGE);
  });

  it("5xx, a network error and a timeout are unavailable", async () => {
    fetchMock.mockResolvedValueOnce(reply(502, { error: "bad gateway" }));
    expect((await checkEuVat("DE123456789", "DE")).status).toBe("unavailable");
    fetchMock.mockResolvedValueOnce(reply(500, undefined));
    expect((await checkEuVat("DE123456789", "DE")).status).toBe("unavailable");
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const result = await checkEuVat("DE123456789", "DE");
    expect(result).toMatchObject({ status: "unavailable", message: VIES_UNAVAILABLE_MESSAGE });
    fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    expect((await checkEuVat("DE123456789", "DE")).status).toBe("unavailable");
  });

  it("an unknown status in a 200 is never read as valid", async () => {
    fetchMock.mockResolvedValue(reply(200, { status: "maybe" }));
    expect((await checkEuVat("DE123456789", "DE")).status).toBe("unavailable");
  });

  it("400 and 401 are errors, not an answer about the VAT number", async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: "bad request" }));
    await expect(checkEuVat("DE123456789", "DE")).rejects.toMatchObject({ name: "HdctoolError", status: 400 });
    fetchMock.mockResolvedValue(reply(401, { error: "unauthorized" }));
    await expect(checkEuVat("DE123456789", "DE")).rejects.toMatchObject({ name: "HdctoolError", status: 401 });
  });
});

describe("quoteDhl", () => {
  const input = { country: "DE", postcode: "10115", city: "Berlin", weightKg: 2.4 };
  const dhl = {
    success: true,
    carrier: "DHL",
    productCode: "U",
    productName: "EXPRESS WORLDWIDE EU",
    netAmount: 31.4,
    vatRate: 24,
    grossAmount: 38.94,
    currency: "EUR",
    estimatedDeliveryDate: "2026-10-30",
    transitDays: 3,
  };

  it("posts the parcel and returns the price with the time it was quoted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T09:30:00.000Z"));
    try {
      fetchMock.mockResolvedValue(reply(200, dhl));
      const result = await quoteDhl(input);
      expect(result).toEqual({
        ok: true,
        productCode: "U",
        productName: "EXPRESS WORLDWIDE EU",
        netAmount: 31.4,
        vatRate: 24,
        grossAmount: 38.94,
        quotedAt: "2026-10-27T09:30:00.000Z",
        estimatedDeliveryDate: "2026-10-30",
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/api\/public\/courier\/quote$/);
      expect(JSON.parse(init.body)).toEqual(input);
    } finally {
      vi.useRealTimers();
    }
  });

  it("omits the delivery date when HDCtool sends none", async () => {
    fetchMock.mockResolvedValue(reply(200, { ...dhl, estimatedDeliveryDate: undefined }));
    expect(await quoteDhl(input)).not.toHaveProperty("estimatedDeliveryDate");
  });

  it.each(["unsupported_country", "invalid_postcode", "unserviceable_postcode"] as const)(
    "a 422 %s is a refusal with that reason",
    async (error) => {
      fetchMock.mockResolvedValue(reply(422, { success: false, error }));
      expect(await quoteDhl(input)).toEqual({ ok: false, reason: error });
    },
  );

  it("502, 504, a network error and an unknown 422 are unavailable", async () => {
    for (const status of [502, 504]) {
      fetchMock.mockResolvedValueOnce(reply(status, { success: false, error: "upstream" }));
      expect(await quoteDhl(input)).toEqual({ ok: false, reason: "unavailable" });
    }
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await quoteDhl(input)).toEqual({ ok: false, reason: "unavailable" });
    fetchMock.mockResolvedValueOnce(reply(422, { success: false, error: "something_else" }));
    expect(await quoteDhl(input)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("a 200 that is not a usable DHL price is unavailable, never a made-up price", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { ...dhl, netAmount: "free" }));
    expect(await quoteDhl(input)).toEqual({ ok: false, reason: "unavailable" });
    fetchMock.mockResolvedValueOnce(reply(200, { ...dhl, carrier: "ACS" }));
    expect(await quoteDhl(input)).toEqual({ ok: false, reason: "unavailable" });
    fetchMock.mockResolvedValueOnce(reply(200, { success: false, error: "invalid_postcode" }));
    expect(await quoteDhl(input)).toEqual({ ok: false, reason: "invalid_postcode" });
  });
});
