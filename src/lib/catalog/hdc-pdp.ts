import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Every active product of one Milwaukee model — the bare tool and its kits,
 * joined by the model root the sync derives from the name ("M18 FPD3").
 *
 * Per request (React `cache`), not the shared catalogue cache: the tile of the
 * product being viewed must show the same price and stock as the buy box
 * under it, and the price difference in the hint is computed from these.
 */
export type ModelVariant = {
  id: string;
  slug: string;
  /** The ERP (Greek) name: the model code lives in it. */
  name: string;
  code2: string;
  content: "bare" | "kit" | null;
  priceNet: number | null;
  vatRate: number;
  qty: number;
  inStock: boolean;
  image: string | null;
  /** Greek long description, for the kit's contents line. */
  longDescriptionEl: string | null;
};

const num = (value: unknown): number | null => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const getModelVariants = cache(async (modelRoot: string): Promise<ModelVariant[]> => {
  const rows = await prisma.product.findMany({
    where: { isActive: true, modelRoot },
    orderBy: [{ priceNet: "asc" }, { mtrl: "asc" }],
    take: 12,
    select: {
      id: true,
      slug: true,
      name: true,
      code2: true,
      modelContent: true,
      priceNet: true,
      vatRate: true,
      qty: true,
      inStock: true,
      images: { orderBy: [{ isFeature: "desc" }, { order: "asc" }], take: 1, select: { url: true } },
      translations: { where: { locale: "el" }, select: { longDescription: true } },
    },
  });

  return rows
    .map((row): ModelVariant => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      code2: row.code2,
      content:
        row.modelContent === "bare" || row.modelContent === "kit" ? row.modelContent : null,
      priceNet: num(row.priceNet),
      vatRate: num(row.vatRate) ?? 24,
      qty: num(row.qty) ?? 0,
      inStock: row.inStock,
      image: row.images[0]?.url ?? null,
      longDescriptionEl: row.translations[0]?.longDescription ?? null,
    }))
    // The bare tool first, then the kits from the cheapest up.
    .sort((a, b) => (a.content === "bare" ? 0 : 1) - (b.content === "bare" ? 0 : 1));
});
