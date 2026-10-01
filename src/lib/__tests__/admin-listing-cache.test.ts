import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Admin writes that change what a listing grid shows must clear the
 * in-process grid cache (listing-cache.ts), as they already revalidate the
 * storefront: a campaign switched on or off, a translated product name.
 */
const clearListingCache = vi.hoisted(() => vi.fn());
vi.mock("@/lib/catalog/listing-cache", () => ({ clearListingCache }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { role: "admin", email: "a@b" } }) }));
vi.mock("@/lib/rbac", () => ({ assertCan: () => undefined }));
vi.mock("@/lib/offers/offers", () => ({
  saveOffer: vi.fn(async () => ({ ok: true })),
  deleteOffer: vi.fn(async () => ({ ok: true })),
  rewriteCopy: vi.fn(),
}));
vi.mock("@/lib/media/picker", () => ({ searchCategoriesForPicker: vi.fn(), searchProductsForPicker: vi.fn() }));
vi.mock("@/lib/ai/deepseek", () => ({ translateText: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/i18n/coverage", () => ({
  listMissing: vi.fn(),
  setTranslation: vi.fn(async () => ({ ok: true })),
  translateMissing: vi.fn(async () => ({ translated: 3 })),
}));

const offers = await import("@/app/admin/(protected)/offers/actions");
const translations = await import("@/app/admin/(protected)/translations/actions");

beforeEach(() => clearListingCache.mockClear());

describe("admin writes clear the listing grid cache", () => {
  it("when a campaign is saved or deleted", async () => {
    await offers.actionSaveOffer({ scope: "products" } as never);
    expect(clearListingCache).toHaveBeenCalledTimes(1);
    await offers.actionDeleteOffer("o1");
    expect(clearListingCache).toHaveBeenCalledTimes(2);
  });

  it("when a translation is set or filled in", async () => {
    await translations.actionSetTranslation("product" as never, "en", "p1", "Drill");
    expect(clearListingCache).toHaveBeenCalledTimes(1);
    await translations.actionTranslateMissing("product" as never, "en");
    expect(clearListingCache).toHaveBeenCalledTimes(2);
  });
});
