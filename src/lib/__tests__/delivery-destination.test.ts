import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The cart's country box and the checkout's country/Τ.Κ./city fields write the
 * destination (docs/dhl-express.md §4). Flag off: refused, nothing written —
 * the Greek postcode cookie path is untouched.
 */

const jar = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn(), get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { setDeliveryDestination } = await import("@/lib/cart/actions");
const { DESTINATION_COOKIE } = await import("@/lib/shipping/destination-cookie");
const { POSTCODE_COOKIE } = await import("@/lib/cart/cart");

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  delete process.env.INTERNATIONAL_SHIPPING_ENABLED;
});

describe("setDeliveryDestination", () => {
  it("does nothing with the flag off", async () => {
    expect(await setDeliveryDestination({ country: "IT", postcode: "37015" })).toEqual({ ok: false, error: "disabled" });
    expect(jar.set).not.toHaveBeenCalled();
  });

  describe("flag on", () => {
    beforeEach(() => {
      process.env.INTERNATIONAL_SHIPPING_ENABLED = "on";
    });

    it("remembers Italy with the postcode as Italy writes it", async () => {
      expect(await setDeliveryDestination({ country: "NL", postcode: "1012ab", city: "Amsterdam" })).toEqual({ ok: true });
      expect(jar.set).toHaveBeenCalledWith(
        DESTINATION_COOKIE,
        JSON.stringify({ country: "NL", postcode: "1012 AB", city: "Amsterdam" }),
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it("keeps the country but not a malformed postcode", async () => {
      expect(await setDeliveryDestination({ country: "IT", postcode: "12" })).toEqual({ ok: false, error: "invalid_postcode" });
      expect(jar.set).toHaveBeenCalledWith(
        DESTINATION_COOKIE,
        JSON.stringify({ country: "IT", postcode: "", city: "" }),
        expect.anything(),
      );
    });

    it("Greece forgets the destination and goes back to the Greek postcode cookie", async () => {
      expect(await setDeliveryDestination({ country: "GR", postcode: "18545" })).toEqual({ ok: true });
      expect(jar.delete).toHaveBeenCalledWith(DESTINATION_COOKIE);
      expect(jar.set).toHaveBeenCalledWith(POSTCODE_COOKIE, "18545", expect.anything());
    });

    it("refuses a country outside the EU", async () => {
      expect(await setDeliveryDestination({ country: "GB", postcode: "SW1A 1AA" })).toEqual({
        ok: false,
        error: "unsupported_country",
      });
    });
  });
});
