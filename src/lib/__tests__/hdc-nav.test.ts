import { describe, expect, it } from "vitest";
import { isHdcNavActive, resolveHdcNav } from "../hdc-nav";

const hrefs = (categories: Array<{ slug: string; name: string }>) =>
  Object.fromEntries(resolveHdcNav(categories).map((item) => [item.key, item.href]));

describe("resolveHdcNav", () => {
  it("falls back to pages that always exist when no category is synced", () => {
    expect(hrefs([])).toEqual({
      battery: "/katalogos",
      accessories: "/katalogos",
      packout: "/anazitisi?q=PACKOUT",
      hand: "/katalogos",
      offers: "/prosfores",
    });
  });

  it("matches the ERP category names, accents and case aside", () => {
    expect(
      hrefs([
        { slug: "exartimata", name: "ΕΞΑΡΤΗΜΑΤΑ ΗΛΕΚΤΡΙΚΩΝ ΕΡΓΑΛΕΙΩΝ ΚΑΙ ΜΠΑΤΑΡΙΑΣ" },
        { slug: "ergaleia-mpatarias", name: "Εργαλεία μπαταρίας" },
        { slug: "ergaleia-cheiros", name: "Εργαλεία χειρός" },
        { slug: "packout", name: "PACKOUT αποθήκευση" },
      ]),
    ).toEqual({
      battery: "/katalogos/ergaleia-mpatarias",
      accessories: "/katalogos/exartimata",
      packout: "/katalogos/packout",
      hand: "/katalogos/ergaleia-cheiros",
      offers: "/prosfores",
    });
  });
});

describe("isHdcNavActive", () => {
  it("lights up the category and its sub-pages", () => {
    expect(isHdcNavActive("/katalogos/packout", "/katalogos/packout")).toBe(true);
    expect(isHdcNavActive("/prosfores", "/prosfores/black-friday")).toBe(true);
    expect(isHdcNavActive("/prosfores", "/")).toBe(false);
  });

  it("never lights up a shared fallback", () => {
    expect(isHdcNavActive("/katalogos", "/katalogos")).toBe(false);
    expect(isHdcNavActive("/anazitisi?q=PACKOUT", "/anazitisi")).toBe(false);
  });
});
