import "server-only";
import { prisma } from "@/lib/prisma";
import { sharedCatalogue } from "@/lib/catalog/shared-cache";

const DAY = 60 * 60 * 24;

const FIELD = { CATEGORY: "mtrcategory", GROUP: "mtrgroup", SUBGROUP: "cccSubgroup2" } as const;

/**
 * Greek text written about a category's products — their short descriptions
 * and names — from which the category's ERP capitals get their accents back
 * (src/lib/seo/category-seo.ts). Cached for a day: the words do not change.
 */
export const categoryGreekTexts = sharedCatalogue(
  "category-greek-texts-v1",
  DAY,
  async (erpType: string, erpCode: string): Promise<string[]> => {
    const field = FIELD[erpType as keyof typeof FIELD];
    const code = Number(erpCode);
    if (!field || !Number.isFinite(code)) return [];
    const rows = await prisma.product.findMany({
      where: { isActive: true, [field]: code },
      orderBy: { mtrl: "asc" },
      take: 60,
      select: { translations: { where: { locale: "el" }, select: { shortDescription: true } } },
    });
    return rows.map((r) => r.translations[0]?.shortDescription ?? "").filter(Boolean);
  },
);
