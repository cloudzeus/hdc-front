import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { sharedCatalogue } from "@/lib/catalog/shared-cache";
import { parseModel, type Platform } from "@/lib/milwaukee/model";

/**
 * Models and platforms, for the model pages (/montelo/<model>) and the
 * platform hubs (/milwaukee-m18, …).
 *
 * A product belongs to a model by its `modelRoot`, or — for rows the sync has
 * not re-parsed yet (MX FUEL codes were taught to `parseModel` on 30/9/2026) —
 * by the model code in its name. Only active products count, so a model page
 * exists exactly while the store lists at least one version of it.
 */

export type ModelProduct = {
  id: string;
  slug: string;
  /** The ERP (Greek) name. */
  name: string;
  code2: string;
  code1: string;
  content: "bare" | "kit" | null;
  priceNet: number | null;
  vatRate: number;
  qty: number;
  inStock: boolean;
  supplierAvailable: boolean;
  platform: Platform | null;
  brandSlug: string | null;
  image: string | null;
  shortDescriptionEl: string | null;
  longDescriptionEl: string | null;
};

const num = (value: unknown): number | null => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const asPlatform = (p: string | null): Platform | null => (p === "M12" || p === "M18" || p === "MX" ? p : null);

/** Every active version of one model: the bare tool first, then kits by price. */
export const getModelProducts = cache(async (root: string): Promise<ModelProduct[]> => {
  const token = root.split(" ")[1] ?? root;
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [{ modelRoot: root }, { modelRoot: null, name: { contains: token, mode: "insensitive" } }],
    },
    orderBy: [{ priceNet: "asc" }, { mtrl: "asc" }],
    take: 40,
    select: {
      id: true,
      slug: true,
      name: true,
      code2: true,
      code1: true,
      modelRoot: true,
      modelContent: true,
      priceNet: true,
      vatRate: true,
      qty: true,
      inStock: true,
      supplierAvailable: true,
      platform: true,
      mtrmark: true,
      images: { orderBy: [{ isFeature: "desc" }, { order: "asc" }], take: 1, select: { url: true } },
      translations: { where: { locale: "el" }, select: { shortDescription: true, longDescription: true } },
    },
  });
  const mine = rows.filter((r) => (r.modelRoot ?? parseModel(r.name)?.root) === root);
  const marks = [...new Set(mine.map((r) => r.mtrmark).filter((m): m is number => m != null))];
  const brands = marks.length
    ? await prisma.brand.findMany({ where: { mtrmark: { in: marks } }, select: { mtrmark: true, slug: true } })
    : [];
  const brandSlug = new Map(brands.map((b) => [b.mtrmark, b.slug]));

  return mine
    .map((r): ModelProduct => {
      const parsed = parseModel(r.name);
      const content =
        r.modelContent === "bare" || r.modelContent === "kit" ? r.modelContent : (parsed?.content ?? null);
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        code2: r.code2,
        code1: r.code1,
        content,
        priceNet: num(r.priceNet),
        vatRate: num(r.vatRate) ?? 24,
        qty: num(r.qty) ?? 0,
        inStock: r.inStock,
        supplierAvailable: r.supplierAvailable,
        platform: asPlatform(r.platform) ?? parsed?.platform ?? null,
        brandSlug: r.mtrmark != null ? (brandSlug.get(r.mtrmark) ?? null) : null,
        image: r.images[0]?.url ?? null,
        shortDescriptionEl: r.translations[0]?.shortDescription ?? null,
        longDescriptionEl: r.translations[0]?.longDescription ?? null,
      };
    })
    .sort((a, b) => Number(a.content !== "bare") - Number(b.content !== "bare"));
});

export type ModelSummary = {
  root: string;
  platform: Platform;
  /** Active versions. */
  versions: number;
  inStock: number;
  /** The version a card shows: the bare tool, in stock if possible. */
  leadCode2: string;
  /** The ERP name of that version. */
  leadName: string;
  /** ISO — the shared cache stores JSON, so no Date objects. */
  lastUpdated: string;
};

const HOUR = 60 * 60;

/**
 * Every model the store lists, with its number of versions — for the hubs'
 * «popular models», the sitemap and llms-full.txt. One query, cached for an
 * hour with the rest of the catalogue.
 */
export const getAllModels = sharedCatalogue("all-models-v1", HOUR, async (): Promise<ModelSummary[]> => {
  const rows = await prisma.product.findMany({
    where: { isActive: true, platform: { not: null } },
    select: { name: true, code2: true, platform: true, modelRoot: true, modelContent: true, inStock: true, updatedAt: true },
  });
  const byRoot = new Map<string, ModelSummary & { leadScore: number }>();
  for (const row of rows) {
    const root = row.modelRoot ?? parseModel(row.name)?.root;
    const platform = asPlatform(row.platform);
    if (!root || !platform) continue;
    const bare = (row.modelContent ?? parseModel(row.name)?.content) === "bare";
    const score = (bare ? 2 : 0) + (row.inStock ? 1 : 0);
    const entry = byRoot.get(root);
    if (!entry) {
      byRoot.set(root, {
        root,
        platform,
        versions: 1,
        inStock: row.inStock ? 1 : 0,
        leadCode2: row.code2,
        leadName: row.name,
        lastUpdated: row.updatedAt.toISOString(),
        leadScore: score,
      });
      continue;
    }
    entry.versions++;
    if (row.inStock) entry.inStock++;
    if (row.updatedAt.toISOString() > entry.lastUpdated) entry.lastUpdated = row.updatedAt.toISOString();
    if (score > entry.leadScore) {
      entry.leadScore = score;
      entry.leadCode2 = row.code2;
      entry.leadName = row.name;
    }
  }
  return [...byRoot.values()]
    .map(({ root, platform, versions, inStock, leadCode2, leadName, lastUpdated }) => ({
      root,
      platform,
      versions,
      inStock,
      leadCode2,
      leadName,
      lastUpdated,
    }))
    .sort((a, b) => b.versions - a.versions || b.inStock - a.inStock || a.root.localeCompare(b.root, "en", { numeric: true }));
});

/** The catalogue groups a platform (or PACKOUT) has products in, busiest first. */
export const getHubGroups = sharedCatalogue(
  "hub-groups-v1",
  HOUR,
  async (
    filter: { platform: Platform } | { name: string },
    limit = 12,
  ): Promise<Array<{ slug: string; nameEl: string; nameEn: string; nameIt: string; count: number }>> => {
    const where =
      "platform" in filter
        ? { isActive: true, platform: filter.platform }
        : { isActive: true, name: { contains: filter.name, mode: "insensitive" as const } };
    const groups = await prisma.product.groupBy({
      by: ["mtrgroup"],
      where: { ...where, mtrgroup: { not: null } },
      _count: { _all: true },
    });
    const counts = new Map(groups.map((g) => [String(g.mtrgroup), g._count._all]));
    const categories = await prisma.category.findMany({
      where: { erpType: "GROUP", erpCode: { in: [...counts.keys()] }, productCount: { gt: 0 } },
      select: { slug: true, erpCode: true, nameEl: true, nameEn: true, nameIt: true },
    });
    return categories
      .map((c) => ({ slug: c.slug, nameEl: c.nameEl, nameEn: c.nameEn, nameIt: c.nameIt, count: counts.get(c.erpCode) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },
);

/** Batteries and chargers of one platform (not the battery-and-charger sets), in stock first. */
export const getPlatformPower = sharedCatalogue(
  "platform-power-v1",
  HOUR,
  async (platform: Platform): Promise<{ batteries: string[]; chargers: string[] }> => {
    const rows = await prisma.product.findMany({
      where: {
        isActive: true,
        platform,
        modelRoot: null,
        priceNet: { gt: 0 },
        OR: [
          { name: { contains: "ΜΠΑΤΑΡΙΑ", mode: "insensitive" } },
          { name: { contains: "ΦΟΡΤΙΣΤ", mode: "insensitive" } },
        ],
        NOT: [{ name: { contains: "ΣΕΤ", mode: "insensitive" } }, { name: { contains: "SET", mode: "insensitive" } }],
      },
      orderBy: [{ inStock: "desc" }, { priceNet: "asc" }],
      take: 40,
      select: { name: true, code2: true },
    });
    const isCharger = (name: string) => /ΦΟΡΤΙΣΤ/i.test(name);
    return {
      batteries: rows.filter((r) => !isCharger(r.name)).map((r) => r.code2).slice(0, 4),
      chargers: rows.filter((r) => isCharger(r.name)).map((r) => r.code2).slice(0, 4),
    };
  },
);

/** PACKOUT products for the hub: in stock, with a picture, newest first. */
export const getPackoutCodes = sharedCatalogue("packout-codes-v1", HOUR, async (limit = 8): Promise<string[]> => {
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      isVariantLead: true,
      inStock: true,
      priceNet: { gt: 0 },
      name: { contains: "PACKOUT", mode: "insensitive" },
      images: { some: {} },
    },
    orderBy: [{ erpInsertedAt: "desc" }, { mtrl: "desc" }],
    take: limit,
    select: { code2: true },
  });
  return rows.map((r) => r.code2);
});
