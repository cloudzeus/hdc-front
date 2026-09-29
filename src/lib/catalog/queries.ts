import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { sharedCatalogue } from "@/lib/catalog/shared-cache";
import type { Locale } from "@/i18n/routing";
import { nameWithoutSize } from "@/lib/catalog/variant-name";
import { withFamilies, type FamilySummary } from "@/lib/catalog/variants";

/**
 * Read queries against the local catalogue projection.
 *
 * Everything here hits our own Postgres, never HDCtool — that is the whole
 * point of the projection (BACKEND_ALIGNMENT.md §2).
 */

/*
 * Οι χρόνοι ζωής του κοινού cache.
 *
 * Η ταξινομία αλλάζει λίγες φορές τον μήνα· τα αποθέματα κάθε δέκα λεπτά, από
 * τον συγχρονισμό. Γι' αυτό ό,τι κουβαλά τιμή ή διαθεσιμότητα ζει λιγότερο.
 */
const SLOW = 900; // ταξινομία, μάρκες — αλλάζουν σπάνια
const FAST = 300; // ό,τι κουβαλά τιμή ή απόθεμα

/** Picks the right translated column for the active locale, Greek as fallback. */
function localised<
  T extends { nameEl: string; nameEn: string; nameIt: string },
>(row: T, locale: Locale): string {
  if (locale === "en") return row.nameEn || row.nameEl;
  if (locale === "it") return row.nameIt || row.nameEl;
  return row.nameEl;
}

export type CategoryTile = {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  productCount: number;
  childCount: number;
};

/**
 * Root categories for the homepage grid and the "ΑΓΟΡΑ ΑΝΑ ΚΑΤΗΓΟΡΙΑ" band.
 *
 * Only categories that actually have products — the ERP tree carries nodes with
 * zero eshop-listed SKUs (ΑΝΥΨΩΤΙΚΑ is one), and a tile reading "0 ΚΩΔ." is
 * worse than no tile.
 */
export const getRootCategories = sharedCatalogue(
  "root-categories",
  SLOW,
  async (locale: Locale, limit?: number): Promise<CategoryTile[]> => {
    const rows = await prisma.category.findMany({
      where: { erpType: "CATEGORY", productCount: { gt: 0 } },
      orderBy: [{ productCount: "desc" }, { nameEl: "asc" }],
      take: limit,
      select: {
        id: true,
        slug: true,
        nameEl: true,
        nameEn: true,
        nameIt: true,
        mainImage: true,
        productCount: true,
        childCount: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: localised(row, locale),
      image: row.mainImage,
      productCount: row.productCount,
      childCount: row.childCount,
    }));
  },
);

export type MenuCategory = CategoryTile & {
  children: Array<{
    id: string;
    slug: string;
    name: string;
    productCount: number;
  }>;
};

/**
 * Category tree for the mega-menu and the mobile drawer: root categories with
 * their immediate children, both filtered to nodes that actually have products.
 *
 * One query for roots, one for children — not one per root. There are 23 roots,
 * so the naive version would be 24 round trips on every page render.
 */
export const getMenuTree = sharedCatalogue(
  "menu-tree",
  SLOW,
  async (locale: Locale, childrenPerCategory = 5): Promise<MenuCategory[]> => {
    const roots = await prisma.category.findMany({
      where: { erpType: "CATEGORY", productCount: { gt: 0 } },
      orderBy: [{ productCount: "desc" }, { nameEl: "asc" }],
      select: {
        id: true,
        slug: true,
        nameEl: true,
        nameEn: true,
        nameIt: true,
        mainImage: true,
        productCount: true,
        childCount: true,
      },
    });

    const children = await prisma.category.findMany({
      where: {
        parentId: { in: roots.map((r) => r.id) },
        productCount: { gt: 0 },
      },
      orderBy: [{ productCount: "desc" }, { nameEl: "asc" }],
      select: {
        id: true,
        parentId: true,
        slug: true,
        nameEl: true,
        nameEn: true,
        nameIt: true,
        productCount: true,
      },
    });

    const byParent = new Map<string, typeof children>();
    for (const child of children) {
      if (!child.parentId) continue;
      const list = byParent.get(child.parentId) ?? [];
      if (list.length < childrenPerCategory) list.push(child);
      byParent.set(child.parentId, list);
    }

    return roots.map((root) => ({
      id: root.id,
      slug: root.slug,
      name: localised(root, locale),
      image: root.mainImage,
      productCount: root.productCount,
      childCount: root.childCount,
      children: (byParent.get(root.id) ?? []).map((child) => ({
        id: child.id,
        slug: child.slug,
        name: localised(child, locale),
        productCount: child.productCount,
      })),
    }));
  },
);

export type BrandTile = {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  productCount: number;
};

/**
 * Οι μάρκες με τουλάχιστον ένα δημοσιευμένο είδος, από τη μεγαλύτερη.
 *
 * Το όριο ήταν 16 και οι μάρκες με προϊόντα είναι 19: η BOSCH, η CAT και η
 * LEATHERMAN έμεναν έξω από το μενού ενώ τα είδη τους πωλούνταν κανονικά — «στο
 * eshop εμφανίζονται προϊόντα από τις 2 νέες μάρκες, στο μενού brands δεν
 * φαίνονται». Ένα όριο που κόβει μια μάρκα που αντιπροσωπεύουμε είναι λάθος
 * όριο· το 48 είναι φράγμα για το ερώτημα, όχι κανόνας παρουσίασης.
 *
 * Όποιος θέλει συγκεκριμένο πλήθος πλακιδίων το κόβει στην όψη — ο τοίχος της
 * αρχικής κρατά 16 για δύο γεμάτες σειρές.
 */
export const getTopBrands = sharedCatalogue(
  "top-brands",
  SLOW,
  async (locale: Locale, limit = 48): Promise<BrandTile[]> => {
    const rows = await prisma.brand.findMany({
      where: { productCount: { gt: 0 } },
      orderBy: { productCount: "desc" },
      take: limit,
      select: {
        id: true,
        slug: true,
        nameEl: true,
        nameEn: true,
        nameIt: true,
        logo: true,
        productCount: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: localised(row, locale),
      logo: row.logo,
      productCount: row.productCount,
    }));
  },
);

export type ProductCardData = {
  id: string;
  mtrl: number;
  slug: string;
  name: string;
  sku: string;
  brandName: string | null;
  brandSlug: string | null;
  image: string | null;
  priceNet: number | null;
  priceListNet: number | null;
  vatRate: number;
  qty: number;
  inStock: boolean;
  /** Κωδικός IMPA, όπου υπάρχει — για το σήμα της κάρτας. */
  impaCode?: string | null;
  /**
   * Compare scope (`sub:311`). Set only where a comparison is offered — the PLP
   * and the brand grid — so a card can be greyed out before the click rather
   * than after the server refuses it. See `lib/compare/options.ts`.
   */
  scopeKey?: string | null;
  /** ONE-KEY tool: the card adds a second tag under the platform. */
  oneKey?: boolean;
  /**
   * The size family this card stands for (gloves, clothing, boots), when it
   * has more than one size: the card says how many, speaks for the stock of
   * all of them, and sends to the product page to pick one instead of adding
   * whichever size happens to be the lead.
   */
  sizes?: FamilySummary | null;
};

const PRODUCT_CARD_SELECT = {
  id: true,
  mtrl: true,
  slug: true,
  name: true,
  code2: true,
  code: true,
  mtrmark: true,
  mtrcategory: true,
  priceNet: true,
  priceList: true,
  vatRate: true,
  qty: true,
  inStock: true,
  images: {
    where: { isFeature: true },
    take: 1,
    select: { url: true },
  },
  translations: {
    select: { locale: true, name: true },
  },
  impaCode: true,
  variantGroup: true,
  /* Μία ετικέτα αρκεί: ένας κωδικός είναι ΕΝΑ νούμερο, και η ομάδα χτίζεται
     πάνω σε αυτή την παραδοχή. */
  sizes: { select: { label: true }, orderBy: { order: "asc" }, take: 1 },
} as const;

type ProductRow = {
  id: string;
  mtrl: number;
  slug: string;
  name: string;
  code: string;
  code2: string;
  mtrmark: number | null;
  mtrcategory: number | null;
  priceNet: unknown;
  priceList: unknown;
  vatRate: unknown;
  qty: unknown;
  inStock: boolean;
  images: Array<{ url: string }>;
  translations: Array<{ locale: string; name: string }>;
  variantGroup: string | null;
  impaCode: string | null;
  sizes: Array<{ label: string }>;
};

/** Prisma returns Decimal; the UI wants plain numbers. */
function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toCard(
  row: ProductRow,
  locale: Locale,
  brands: Map<number, { name: string; slug: string }>,
): ProductCardData {
  const translated = row.translations.find((t) => t.locale === locale)?.name;
  const brand = row.mtrmark != null ? brands.get(row.mtrmark) : undefined;

  return {
    id: row.id,
    mtrl: row.mtrl,
    slug: row.slug,
    /* Η κάρτα εκπροσωπεί ΟΛΗ την ομάδα — «No 36» στον τίτλο θα έλεγε ότι
       το προϊόν είναι το 36, ενώ είναι το παπούτσι. */
    name: nameWithoutSize(translated?.trim() || row.name, {
      variantGroup: row.variantGroup,
      sizeLabel: row.sizes[0]?.label,
    }),
    sku: row.code2 || row.code,
    impaCode: row.impaCode,
    brandName: brand?.name ?? null,
    brandSlug: brand?.slug ?? null,
    image: row.images[0]?.url ?? null,
    priceNet: num(row.priceNet),
    priceListNet: num(row.priceList),
    vatRate: num(row.vatRate) ?? 24,
    qty: num(row.qty) ?? 0,
    inStock: row.inStock,
  };
}

/** MTRMARK → brand, so product cards can show a brand without a join per row. */
const getBrandsByMtrmark = cache(
  async (
    locale: Locale,
  ): Promise<Map<number, { name: string; slug: string }>> => {
    const rows = await prisma.brand.findMany({
      where: { mtrmark: { not: null } },
      select: {
        mtrmark: true,
        slug: true,
        nameEl: true,
        nameEn: true,
        nameIt: true,
      },
    });
    return new Map(
      rows.map((row) => [
        row.mtrmark!,
        { name: localised(row, locale), slug: row.slug },
      ]),
    );
  },
);

/**
 * Homepage featured products.
 *
 * A true "most sold" ranking needs HDCtool's ERP sales query
 * (`/api/public/most-sold-products`, which runs SQL 141 against SoftOne). That
 * arrives with the merchandising phase; this is the stand-in.
 *
 * Deliberately spread across categories, max 2 per category. Ranking purely by
 * discount or recency returns eight variants of the same product line — the
 * first version of this query filled the whole band with safety boots, which
 * reads as a shoe shop rather than a tool merchant.
 */
export const getFeaturedProducts = sharedCatalogue(
  "featured-products",
  FAST,
  async (
    locale: Locale,
    limit = 8,
    perCategory = 2,
    /** Only products with a feature image — for bands where a blank card would stand out. */
    requireImage = false,
  ): Promise<ProductCardData[]> => {
    const [rows, brands] = await Promise.all([
      prisma.product.findMany({
        // Over-fetch so there is enough to spread across categories.
        // One card per size family, as in every listing.
        where: {
          isActive: true,
          isVariantLead: true,
          inStock: true,
          priceNet: { gt: 0 },
          ...(requireImage ? { images: { some: { isFeature: true } } } : {}),
        },
        orderBy: [
          { onSale: "desc" },
          { erpInsertedAt: "desc" },
          { mtrl: "desc" },
        ],
        take: limit * 12,
        select: PRODUCT_CARD_SELECT,
      }),
      getBrandsByMtrmark(locale),
    ]);

    const perCategoryCount = new Map<number | null, number>();
    const picked: ProductRow[] = [];

    for (const row of rows as ProductRow[]) {
      const key = row.mtrcategory ?? null;
      const used = perCategoryCount.get(key) ?? 0;
      if (used >= perCategory) continue;
      perCategoryCount.set(key, used + 1);
      picked.push(row);
      if (picked.length === limit) break;
    }

    // Thin catalogue (or few categories) — top up rather than under-fill the grid.
    if (picked.length < limit) {
      const seen = new Set(picked.map((p) => p.id));
      for (const row of rows as ProductRow[]) {
        if (picked.length === limit) break;
        if (!seen.has(row.id)) picked.push(row);
      }
    }

    return withFamilies(
      picked.map((row) => toCard(row, locale, brands)),
      (i) => picked[i].variantGroup,
    );
  },
);

/**
 * Specific products by manufacturer code (code2), in the order asked — for a
 * hero slide that names a product and must print its live price.
 */
export const getProductsByCode2 = sharedCatalogue(
  "products-by-code2",
  FAST,
  async (locale: Locale, codes: string[]): Promise<ProductCardData[]> => {
    const [rows, brands] = await Promise.all([
      prisma.product.findMany({
        where: { isActive: true, code2: { in: codes } },
        select: PRODUCT_CARD_SELECT,
      }),
      getBrandsByMtrmark(locale),
    ]);
    const byCode = new Map((rows as ProductRow[]).map((row) => [row.code2, row]));
    const picked = codes
      .map((code) => byCode.get(code))
      .filter((row): row is ProductRow => row != null);
    return withFamilies(
      picked.map((row) => toCard(row, locale, brands)),
      (i) => picked[i].variantGroup,
    );
  },
);

/**
 * The home page's "ΝΕΕΣ ΑΦΙΞΕΙΣ" band: the newest in-stock products with a
 * picture, by `firstListedAt` — the same date the new-arrivals page reads.
 *
 * On a freshly synced catalogue every product was "first listed" by the same
 * sync run, minutes apart, so "newest" would just be whatever the sync wrote
 * last. Until the listing dates span more than a day the band shows the most
 * expensive in-stock products instead — a stable placeholder, flagged as such.
 */
export const getHomeNewArrivals = sharedCatalogue(
  "home-new-arrivals",
  FAST,
  async (
    locale: Locale,
    limit = 4,
  ): Promise<{ products: ProductCardData[]; placeholder: boolean }> => {
    const where = {
      isActive: true,
      isVariantLead: true,
      inStock: true,
      priceNet: { gt: 0 },
      images: { some: { isFeature: true } },
    } as const;

    const span = await prisma.product.aggregate({
      where: { isActive: true, firstListedAt: { not: null } },
      _min: { firstListedAt: true },
      _max: { firstListedAt: true },
    });
    const first = span._min.firstListedAt?.getTime();
    const last = span._max.firstListedAt?.getTime();
    const placeholder = first == null || last == null || last - first < 86_400_000;

    const [rows, brands] = await Promise.all([
      prisma.product.findMany({
        where: placeholder ? where : { ...where, firstListedAt: { not: null } },
        orderBy: placeholder
          ? [{ priceNet: "desc" }, { mtrl: "desc" }]
          : [{ firstListedAt: "desc" }, { mtrl: "desc" }],
        take: limit,
        select: PRODUCT_CARD_SELECT,
      }),
      getBrandsByMtrmark(locale),
    ]);

    return {
      products: await withFamilies(
        (rows as ProductRow[]).map((row) => toCard(row, locale, brands)),
        (i) => (rows as ProductRow[])[i].variantGroup,
      ),
      placeholder,
    };
  },
);

/**
 * Root categories with the number of their sub-groups that have products —
 * what the home page's category cards are matched against.
 *
 * The Greek (ERP) name, whatever the visitor's language, so a card's match does
 * not depend on how a translator rendered the category.
 */
export const getHomeCategorySources = sharedCatalogue(
  "home-category-sources",
  SLOW,
  async (): Promise<Array<{ slug: string; name: string; groups: number }>> => {
    const roots = await prisma.category.findMany({
      where: { erpType: "CATEGORY", productCount: { gt: 0 } },
      orderBy: [{ productCount: "desc" }, { nameEl: "asc" }],
      select: { id: true, slug: true, nameEl: true },
    });
    const counts = await prisma.category.groupBy({
      by: ["parentId"],
      where: { parentId: { in: roots.map((r) => r.id) }, productCount: { gt: 0 } },
      _count: { _all: true },
    });
    const byParent = new Map(counts.map((c) => [c.parentId, c._count._all]));
    return roots.map((root) => ({
      slug: root.slug,
      name: root.nameEl,
      groups: byParent.get(root.id) ?? 0,
    }));
  },
);

/**
 * The children of one category that have products, with their Greek (ERP)
 * names — for links that have to find a group by what it is called.
 */
export const getCategoryChildren = sharedCatalogue(
  "category-children",
  SLOW,
  async (parentSlug: string): Promise<Array<{ slug: string; name: string }>> => {
    const rows = await prisma.category.findMany({
      where: { parent: { slug: parentSlug }, productCount: { gt: 0 } },
      orderBy: [{ productCount: "desc" }, { nameEl: "asc" }],
      select: { slug: true, nameEl: true },
    });
    return rows.map((row) => ({ slug: row.slug, name: row.nameEl }));
  },
);

/** Newest additions, for the "ΝΕΕΣ ΑΦΙΞΕΙΣ" promo tile copy. */
export const getCatalogueStats = sharedCatalogue(
  "catalogue-stats",
  FAST,
  async () => {
    const [products, inStock, brands, categories] = await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.count({ where: { isActive: true, inStock: true } }),
      prisma.brand.count({ where: { productCount: { gt: 0 } } }),
      prisma.category.count({
        where: { erpType: "CATEGORY", productCount: { gt: 0 } },
      }),
    ]);
    const subcategories = await prisma.category.count({
      where: {
        erpType: { in: ["GROUP", "SUBGROUP"] },
        productCount: { gt: 0 },
      },
    });

    return { products, inStock, brands, categories, subcategories };
  },
);

/**
 * The batteries of one platform — what the product page matches a kit's
 * «2 × 5.0Ah» against (`matchBattery`), for the in-the-box tile and the first
 * card of the same-battery band. Accessories and batteries carry no model root.
 */
export const getPlatformBatteries = sharedCatalogue(
  "platform-batteries",
  FAST,
  async (
    platform: string,
  ): Promise<Array<{ id: string; slug: string; name: string; code2: string; inStock: boolean; image: string | null }>> => {
    const rows = await prisma.product.findMany({
      where: {
        isActive: true,
        platform,
        modelRoot: null,
        name: { contains: "ΜΠΑΤΑΡΙΑ", mode: "insensitive" },
      },
      orderBy: [{ inStock: "desc" }, { mtrl: "asc" }],
      take: 60,
      select: {
        id: true,
        slug: true,
        name: true,
        code2: true,
        inStock: true,
        images: { where: { isFeature: true }, take: 1, select: { url: true } },
      },
    });
    return rows.map(({ images, ...row }) => ({ ...row, image: images[0]?.url ?? null }));
  },
);

/**
 * «ΙΔΙΑ ΜΠΑΤΑΡΙΑ, ΚΙ ΑΛΛΑ ΕΡΓΑΛΕΙΑ» on the product page: in-stock BARE tools
 * of one platform, other than the model being viewed — for whoever bought a
 * kit and wants a second tool without paying for batteries again.
 *
 * One tool per subgroup, so the band is four different jobs rather than four
 * drills; FUEL first, newest first.
 */
export const getSameBatteryTools = sharedCatalogue(
  "same-battery-tools",
  FAST,
  async (
    locale: Locale,
    platform: string,
    excludeRoot: string | null,
    limit = 4,
  ): Promise<ProductCardData[]> => {
    const [rows, brands] = await Promise.all([
      prisma.product.findMany({
        where: {
          isActive: true,
          isVariantLead: true,
          inStock: true,
          platform,
          modelContent: "bare",
          priceNet: { gt: 0 },
          images: { some: { isFeature: true } },
          ...(excludeRoot ? { NOT: { modelRoot: excludeRoot } } : {}),
        },
        orderBy: [{ isFuel: "desc" }, { erpInsertedAt: "desc" }, { mtrl: "desc" }],
        take: limit * 15,
        select: { ...PRODUCT_CARD_SELECT, cccSubgroup2: true, isOneKey: true },
      }),
      getBrandsByMtrmark(locale),
    ]);

    const seen = new Set<number | null>();
    const picked: typeof rows = [];
    for (const row of rows) {
      if (seen.has(row.cccSubgroup2)) continue;
      seen.add(row.cccSubgroup2);
      picked.push(row);
      if (picked.length === limit) break;
    }
    // Few subgroups on this platform: top up rather than leave a hole.
    for (const row of rows) {
      if (picked.length === limit) break;
      if (!picked.includes(row)) picked.push(row);
    }

    return picked.map((row) => ({
      ...toCard(row as unknown as ProductRow, locale, brands),
      oneKey: row.isOneKey,
    }));
  },
);
