import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/routing";
import { sharedCatalogue } from "@/lib/catalog/shared-cache";
import {
  buildMegaMenu,
  type CountRow,
  type LocalCategory,
  type MegaMenuData,
  type TopRow,
} from "@/lib/catalog/mega-menu-core";
import { grossAmount } from "@/lib/format";
import { hdctool } from "@/lib/hdctool/client";
import { displayName } from "@/lib/milwaukee/display";
import { prisma } from "@/lib/prisma";

/**
 * The mega menu's data: HDCtool's Milwaukee tree (names, order, photos),
 * counted and illustrated with the eshop's OWN active products.
 *
 * Four small queries, cached for ten minutes per language across requests —
 * the menu sits on every page, and its numbers only move when a sync runs:
 *
 *   1. the synced categories, for the link targets,
 *   2. active products per (MTRCATEGORY, MTRGROUP, platform, in stock) — a
 *      GROUP BY of ~2.900 rows into a few hundred,
 *   3. per (MTRCATEGORY, MTRGROUP, platform) the product a stage shows: in
 *      stock first, then the dearest, and only ones with a photo,
 *   4. the English / Italian names of those few products.
 */

type RawTop = {
  id: string;
  mtrcategory: number | null;
  mtrgroup: number | null;
  platform: string | null;
  name: string;
  code2: string;
  slug: string;
  priceNet: Prisma.Decimal | null;
  vatRate: Prisma.Decimal | null;
  inStock: boolean;
  image: string;
};

const load = sharedCatalogue(
  "hdc-mega-menu",
  600,
  async (locale: Locale): Promise<MegaMenuData> => {
    /* A failure THROWS inside the cached function, so it is not cached: the
     next request tries HDCtool again instead of ten minutes without a menu. */
    const response = await hdctool.milwaukeeCategories();
    if (!response.success || !Array.isArray(response.data)) {
      throw new Error("milwaukee-categories: unexpected response");
    }

    const [categoryRows, grouped, topRows] = await Promise.all([
      prisma.category.findMany({
        where: { erpType: { in: ["CATEGORY", "GROUP"] } },
        select: {
          erpType: true,
          erpCode: true,
          slug: true,
          nameEl: true,
          parent: { select: { erpCode: true } },
        },
      }),
      // One per size family, as the listings the menu links to count them.
      prisma.product.groupBy({
        by: ["mtrcategory", "mtrgroup", "platform", "inStock"],
        where: { isActive: true, isVariantLead: true },
        _count: { _all: true },
      }),
      prisma.$queryRaw<RawTop[]>(Prisma.sql`
      SELECT DISTINCT ON (p."mtrcategory", p."mtrgroup", p."platform")
             p."id", p."mtrcategory", p."mtrgroup", p."platform", p."name", p."code2",
             p."slug", p."priceNet", p."vatRate", p."inStock", img."url" AS "image"
        FROM "products" p
        JOIN LATERAL (
               SELECT i."url" FROM "product_images" i
                WHERE i."productId" = p."id"
                ORDER BY i."isFeature" DESC, i."order" ASC
                LIMIT 1
             ) img ON TRUE
       WHERE p."isActive" = TRUE AND p."isVariantLead" = TRUE AND p."mtrgroup" IS NOT NULL
       ORDER BY p."mtrcategory", p."mtrgroup", p."platform",
                p."inStock" DESC, p."priceNet" DESC NULLS LAST, p."code2" ASC
    `),
    ]);

    const translations =
      locale === "el" || topRows.length === 0
        ? new Map<string, string>()
        : new Map(
            (
              await prisma.productTranslation.findMany({
                where: { productId: { in: topRows.map((r) => r.id) }, locale },
                select: { productId: true, name: true },
              })
            ).map((t) => [t.productId, t.name]),
          );

    const categories: LocalCategory[] = categoryRows.map((row) => ({
      erpType: row.erpType,
      erpCode: row.erpCode,
      slug: row.slug,
      nameEl: row.nameEl,
      parentCode: row.parent?.erpCode ?? null,
    }));

    const counts: CountRow[] = grouped.map((row) => ({
      mtrcategory: row.mtrcategory,
      mtrgroup: row.mtrgroup,
      platform: row.platform,
      inStock: row.inStock,
      n: row._count._all,
    }));

    const tops: TopRow[] = topRows.map((row) => {
      const net = row.priceNet == null ? null : Number(row.priceNet);
      const vatRate = row.vatRate == null ? undefined : Number(row.vatRate);
      return {
        mtrcategory: row.mtrcategory,
        mtrgroup: row.mtrgroup,
        platform: row.platform,
        name: displayName(translations.get(row.id)?.trim() || row.name, row.code2),
        code: row.code2,
        price:
          net != null && Number.isFinite(net) && net > 0 ? grossAmount(net, { vatRate }) : null,
        image: row.image,
        slug: row.slug,
        inStock: row.inStock,
      };
    });

    return buildMegaMenu({ tree: response.data, locale, categories, counts, tops });
  },
);

/**
 * The menu for one language, or null when HDCtool's tree cannot be read — the
 * header then keeps its five plain links and the drawer its category list.
 */
export async function getMegaMenu(locale: Locale): Promise<MegaMenuData | null> {
  try {
    const data = await load(locale);
    return data.roots.length ? data : null;
  } catch (error) {
    console.warn("[hdc] mega menu unavailable:", (error as Error).message);
    return null;
  }
}
