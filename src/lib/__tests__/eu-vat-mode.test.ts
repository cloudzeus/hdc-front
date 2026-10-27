import { describe, expect, it } from "vitest";
import { athensDay, resolveVatMode } from "@/lib/eu-sales/vat-mode";
import { normaliseEuVat } from "@/lib/eu-sales/vat-format";
import { EU_SALES_COUNTRIES, isDhlDestination } from "@/lib/eu-sales/countries";
import { isEuSalesEnabled } from "@/lib/eu-sales/flag";
import { isInternationalShippingEnabled } from "@/lib/shipping/flag";
import { euSalesShippingMethods } from "@/lib/eu-sales/countries";

/**
 * Who pays VAT (EU sales, B3). Exempt only for a company in another EU
 * country with a VALID VIES answer from the same Europe/Athens calendar day,
 * for the very country now selected. Everything else is standard 24%.
 */

// 27 Oct 2026, 14:00 in Athens (UTC+2 after the clocks went back on the 25th).
const now = new Date("2026-10-27T12:00:00Z");
const today = "2026-10-27T09:15:00Z";
const yesterday = "2026-10-26T20:00:00Z";

describe("resolveVatMode", () => {
  it("GR company with a valid result → standard (Greece is never exempt)", () => {
    expect(
      resolveVatMode({ country: "GR", customerType: "company", vies: { status: "valid", checkedAt: today } }, now),
    ).toBe("standard");
  });

  it("DE individual with a valid result → standard", () => {
    expect(
      resolveVatMode({ country: "DE", customerType: "individual", vies: { status: "valid", checkedAt: today } }, now),
    ).toBe("standard");
  });

  it("DE company valid today → exempt", () => {
    expect(
      resolveVatMode({ country: "DE", customerType: "company", vies: { status: "valid", checkedAt: today } }, now),
    ).toBe("intra_eu_exempt");
  });

  it("DE company valid yesterday → standard", () => {
    expect(
      resolveVatMode({ country: "DE", customerType: "company", vies: { status: "valid", checkedAt: yesterday } }, now),
    ).toBe("standard");
  });

  it("uses the Athens day, not UTC: 23:30 UTC on the 26th is already the 27th in Athens", () => {
    expect(athensDay(new Date("2026-10-26T23:30:00Z"))).toBe("2026-10-27");
    expect(
      resolveVatMode(
        { country: "DE", customerType: "company", vies: { status: "valid", checkedAt: "2026-10-26T23:30:00Z" } },
        now,
      ),
    ).toBe("intra_eu_exempt");
  });

  it("DE company, VIES unavailable / invalid / wrong format / no check → standard", () => {
    for (const status of ["unavailable", "invalid", "invalid_format"]) {
      expect(
        resolveVatMode({ country: "DE", customerType: "company", vies: { status, checkedAt: today } }, now),
      ).toBe("standard");
    }
    expect(resolveVatMode({ country: "DE", customerType: "company", vies: null }, now)).toBe("standard");
    expect(
      resolveVatMode({ country: "DE", customerType: "company", vies: { status: "valid", checkedAt: null } }, now),
    ).toBe("standard");
    expect(
      resolveVatMode({ country: "DE", customerType: "company", vies: { status: "valid", checkedAt: "nonsense" } }, now),
    ).toBe("standard");
  });

  it("country switched DE → AT with the stale DE result → standard (Review Focus 2)", () => {
    expect(
      resolveVatMode(
        { country: "AT", customerType: "company", vies: { status: "valid", checkedAt: today, country: "DE" } },
        now,
      ),
    ).toBe("standard");
  });

  it("switched to «Ιδιώτης» after a valid check → standard", () => {
    expect(
      resolveVatMode(
        { country: "DE", customerType: "individual", vies: { status: "valid", checkedAt: today, country: "DE" } },
        now,
      ),
    ).toBe("standard");
  });

  it("Cyprus is out of scope: never exempt", () => {
    expect(
      resolveVatMode({ country: "CY", customerType: "company", vies: { status: "valid", checkedAt: today } }, now),
    ).toBe("standard");
  });
});

describe("normaliseEuVat (browser format check, before any VIES call)", () => {
  it("cleans the noise customers type (Review Focus 1)", () => {
    expect(normaliseEuVat("de 123 456 789", "DE")).toEqual({ ok: true, vat: "DE123456789" });
    expect(normaliseEuVat("DE-123.456.789", "DE")).toEqual({ ok: true, vat: "DE123456789" });
    expect(normaliseEuVat("DEDE123456789", "DE")).toEqual({ ok: true, vat: "DE123456789" });
    expect(normaliseEuVat("123456789", "DE")).toEqual({ ok: true, vat: "DE123456789" });
  });

  it("a prefix that differs from the selected country is a wrong format", () => {
    expect(normaliseEuVat("AT U12345678", "DE")).toEqual({ ok: false });
    expect(normaliseEuVat("FR12345678901", "DE")).toEqual({ ok: false });
  });

  it("too short, no digits, empty → wrong format", () => {
    expect(normaliseEuVat("", "DE")).toEqual({ ok: false });
    expect(normaliseEuVat("DE", "DE")).toEqual({ ok: false });
    expect(normaliseEuVat("DEABC", "DE")).toEqual({ ok: false });
  });

  it("keeps letters inside the number (AT U…, NL …B01, FR XX…)", () => {
    expect(normaliseEuVat("atu12345678", "AT")).toEqual({ ok: true, vat: "ATU12345678" });
    expect(normaliseEuVat("NL123456789B01", "NL")).toEqual({ ok: true, vat: "NL123456789B01" });
  });
});

describe("EU sales countries and flag", () => {
  it("DHL destinations are the EU-27 minus Greece and Cyprus", () => {
    expect(EU_SALES_COUNTRIES[0]).toBe("GR");
    expect(EU_SALES_COUNTRIES).not.toContain("CY");
    expect(EU_SALES_COUNTRIES).toHaveLength(26);
    expect(isDhlDestination("DE")).toBe(true);
    expect(isDhlDestination("GR")).toBe(false);
    expect(isDhlDestination("CY")).toBe(false);
    expect(isDhlDestination("GB")).toBe(false);
  });

  it("is on only for the exact string «true»", () => {
    expect(isEuSalesEnabled({})).toBe(false);
    expect(isEuSalesEnabled({ EU_SALES_ENABLED: "1" })).toBe(false);
    expect(isEuSalesEnabled({ EU_SALES_ENABLED: "on" })).toBe(false);
    expect(isEuSalesEnabled({ EU_SALES_ENABLED: "true" })).toBe(true);
  });

  it("EU sales bring the country selector with them; both off is the Greek-only shop", () => {
    expect(isInternationalShippingEnabled({})).toBe(false);
    expect(isInternationalShippingEnabled({ EU_SALES_ENABLED: "true" })).toBe(true);
  });

  it("Greece keeps its three methods; abroad is DHL only, no collection", () => {
    expect(euSalesShippingMethods("GR").map((m) => m.id)).toEqual(["courier", "express", "pickup"]);
    expect(euSalesShippingMethods("DE").map((m) => m.id)).toEqual(["dhl"]);
    expect(euSalesShippingMethods("CY")).toEqual([]);
  });
});
