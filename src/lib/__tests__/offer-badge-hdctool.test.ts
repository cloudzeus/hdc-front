import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ offer: { findMany: vi.fn() }, product: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
// Η React cache κρατά ανά αίτημα· στο test κάθε κλήση πρέπει να ρωτά καθαρά.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

import { offerBadgeFor } from "@/lib/offers/badges";

const product = { slug: "gedore-1234", brandSlug: "gedore", priceNet: 120.1613 };

beforeEach(() => {
  db.offer.findMany.mockReset().mockResolvedValue([]);
  db.product.findMany.mockReset().mockResolvedValue([]);
});

describe("προσφορά HDCtool πάνω στο προϊόν", () => {
  it("το σήμα βγαίνει από το προϊόν, χωρίς ερώτημα για καμπάνιες", async () => {
    const badge = await offerBadgeFor(
      { ...product, offerSlug: "black-friday", offerBadge: "BLACK FRIDAY", offerEndsAt: new Date("2026-11-30T21:59:59Z") },
      "el",
    );
    expect(badge).toMatchObject({
      label: "BLACK FRIDAY",
      href: "/prosfores/black-friday",
      endsAt: "2026-11-30T21:59:59.000Z",
    });
    expect(db.offer.findMany).not.toHaveBeenCalled();
  });

  /*
   * Ο ΛΟΓΟΣ ΠΟΥ ΥΠΑΡΧΕΙ ΑΥΤΟ ΤΟ TEST.
   *
   * Η τιμή της προσφοράς είναι ΗΔΗ μέσα στο `priceNet` — ο συγχρονισμός τη
   * βάζει εκεί. Ένα ποσοστό εδώ θα περνούσε στο `discountedNet`, που καλούν
   * και η κάρτα και το καλάθι, και θα έκοβε δεύτερη φορά: 149 € θα γινόταν
   * 117 € στη βιτρίνα και στην χρέωση.
   */
  it("ποσοστό ΜΗΔΕΝ: η έκπτωση είναι μέσα στην τιμή, δεν ξανακόβεται", async () => {
    const badge = await offerBadgeFor({ ...product, offerSlug: "black-friday", offerBadge: null }, "el");
    expect(badge?.discountPercent).toBe(0);
  });

  it("χωρίς δικό του κείμενο, το σήμα λέει «ΠΡΟΣΦΟΡΑ»", async () => {
    const badge = await offerBadgeFor({ ...product, offerSlug: "black-friday", offerBadge: "  " }, "el");
    expect(badge?.label).toBe("ΠΡΟΣΦΟΡΑ");
  });

  it("η προσφορά HDCtool κερδίζει την τοπική καμπάνια που καλύπτει το ίδιο προϊόν", async () => {
    db.offer.findMany.mockResolvedValue([
      {
        slug: "gedore-month", titleEl: "Μήνας Gedore", titleEn: "", titleIt: "", badge: "-30%",
        discount: "percent", discountValue: 30, scope: "brand", productSlugs: [],
        brandSlug: "gedore", categorySlug: null, startsAt: null, endsAt: null,
      },
    ]);
    const badge = await offerBadgeFor({ ...product, offerSlug: "black-friday", offerBadge: "BLACK FRIDAY" }, "el");
    expect(badge?.label).toBe("BLACK FRIDAY");
    expect(badge?.discountPercent).toBe(0);
  });
});

describe("χωρίς προσφορά HDCtool", () => {
  it("οι τοπικές καμπάνιες δουλεύουν όπως πριν", async () => {
    db.offer.findMany.mockResolvedValue([
      {
        slug: "gedore-month", titleEl: "Μήνας Gedore", titleEn: "", titleIt: "", badge: "-30%",
        discount: "percent", discountValue: 30, scope: "brand", productSlugs: [],
        brandSlug: "gedore", categorySlug: null, startsAt: null, endsAt: null,
      },
    ]);
    const badge = await offerBadgeFor({ ...product, offerSlug: null }, "el");
    expect(badge).toMatchObject({ label: "-30%", discountPercent: 30 });
  });
});
