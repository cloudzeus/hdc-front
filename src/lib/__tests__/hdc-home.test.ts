import { describe, expect, it } from "vitest";
import { directionsUrl, drillsHref, isStoreOpen, resolveHomeCategories } from "../hdc-home";

const SYNCED = [
  { slug: "ergaleia-cheiros", name: "ΕΡΓΑΛΕΙΑ ΧΕΙΡΟΣ", groups: 19 },
  { slug: "exartimata", name: "ΕΞΑΡΤΗΜΑΤΑ ΗΛΕΚΤΡΙΚΩΝ ΕΡΓΑΛΕΙΩΝ ΚΑΙ ΜΠΑΤΑΡΙΑΣ", groups: 15 },
  { slug: "ergaleia-batarias", name: "ΕΡΓΑΛΕΙΑ ΜΠΑΤΑΡΙΑΣ", groups: 16 },
  { slug: "diatrisi", name: "ΔΙΑΤΡΗΣΗ", groups: 8 },
  { slug: "metafora", name: "ΜΕΤΑΦΟΡΑ - ΑΠΟΘΗΚΕΥΣΗ - ΘΕΣΗ ΕΡΓΑΣΙΑΣ", groups: 3 },
  { slug: "leiansi-kopi", name: "ΛΕΙΑΝΣΗ - ΚΟΠΗ", groups: 4 },
  { slug: "ilektrologoi", name: "ΕΞΟΠΛΙΣΜΟΣ ΗΛΕΚΤΡΟΛΟΓΩΝ & ΗΛΕΚΤΡΟΝΙΚΏΝ - ΦΩΤΙΣΜΟΣ", groups: 3 },
  { slug: "map", name: "ΜΕΣΑ ΑΤΟΜΙΚΗΣ ΠΡΟΣΤΑΣΙΑΣ - ΟΔΟΠΟΙΙΑ", groups: 5 },
];

describe("resolveHomeCategories", () => {
  it("links every card to the synced category it matches, with its group count", () => {
    const cards = Object.fromEntries(
      resolveHomeCategories(SYNCED).map((c) => [c.key, [c.href, c.groups]]),
    );
    expect(cards).toEqual({
      battery: ["/katalogos/ergaleia-batarias", 16],
      accessories: ["/katalogos/exartimata", 15],
      packout: ["/katalogos/metafora", 3],
      hand: ["/katalogos/ergaleia-cheiros", 19],
      drilling: ["/katalogos/diatrisi", 8],
      grinding: ["/katalogos/leiansi-kopi", 4],
      electrical: ["/katalogos/ilektrologoi", 3],
      ppe: ["/katalogos/map", 5],
    });
  });

  it("falls back to a page that exists, with no count, when nothing matches", () => {
    const cards = resolveHomeCategories([]);
    expect(cards).toHaveLength(8);
    expect(cards.every((c) => c.groups === null)).toBe(true);
    expect(cards.find((c) => c.key === "packout")?.href).toBe("/anazitisi?q=PACKOUT");
    expect(cards.find((c) => c.key === "drilling")?.href).toBe("/katalogos");
  });
});

describe("isStoreOpen", () => {
  const hours = {
    weekdays: { open: "08:00", close: "16:00" },
    saturday: { open: "09:00", close: "14:00" },
    sunday: null,
  };
  it("is open on a weekday inside the hours, Athens time", () => {
    // Monday 28/9/2026 10:00 Athens = 07:00 UTC (EEST, UTC+3)
    expect(isStoreOpen(hours, new Date("2026-09-28T07:00:00Z"))).toBe(true);
  });
  it("is closed before opening, at closing time and on Sunday", () => {
    expect(isStoreOpen(hours, new Date("2026-09-28T04:30:00Z"))).toBe(false); // 07:30
    expect(isStoreOpen(hours, new Date("2026-09-28T13:00:00Z"))).toBe(false); // 16:00
    expect(isStoreOpen(hours, new Date("2026-10-04T08:00:00Z"))).toBe(false); // Sunday 11:00
  });
  it("keeps Saturday's own hours, 09:00-14:00", () => {
    expect(isStoreOpen(hours, new Date("2026-10-03T05:30:00Z"))).toBe(false); // Sat 08:30
    expect(isStoreOpen(hours, new Date("2026-10-03T06:00:00Z"))).toBe(true); // Sat 09:00
    expect(isStoreOpen(hours, new Date("2026-10-03T10:59:00Z"))).toBe(true); // Sat 13:59
    expect(isStoreOpen(hours, new Date("2026-10-03T11:00:00Z"))).toBe(false); // Sat 14:00
  });
});

describe("directionsUrl", () => {
  it("asks Google Maps for directions to the printed address", () => {
    expect(directionsUrl({ street: "Κ. Μαυρομιχάλη 4", postcode: "18545", city: "Πειραιάς" })).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("Κ. Μαυρομιχάλη 4, 18545 Πειραιάς")}`,
    );
  });
});

describe("drillsHref", () => {
  it("lands on the M18 hub, not on a search", () => {
    expect(drillsHref()).toBe("/milwaukee-m18");
  });
});
