import "server-only";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { activeCampaignsWhere } from "@/lib/offers/coverage";
import { sharedCatalogue } from "@/lib/catalog/shared-cache";
import type { Locale } from "@/i18n/routing";
import { nameWithoutSize } from "@/lib/catalog/variant-name";
import { withFamilies } from "@/lib/catalog/variants";
import { scopeKeyOf } from "@/lib/compare/options";
import { searchWhere } from "@/lib/catalog/search-query";
import { DEFAULT_VAT_RATE } from "@/lib/format";
import {
  contentCounts,
  grossToNet,
  hdcFilterClauses,
  parseAvail,
  parseContent,
  parsePlatform,
  parseSeries,
  platformCounts,
  seriesCounts,
  stockClause,
  type Content,
  type Platform,
  type Series,
} from "@/lib/catalog/hdc-filters";
import type { ProductCardData } from "@/lib/catalog/queries";
import {
  PER_PAGE_OPTIONS,
  SORT_OPTIONS,
  type FacetItem,
  type PlpFacets,
  type SortValue,
} from "@/lib/catalog/plp-options";

export type { FacetItem, PlpFacets, SortValue };

/**
 * PLP: filtered listing plus the facet counts beside it.
 *
 * All state lives in `searchParams` so the URL is shareable and the back button
 * is correct. Facet counts are computed against the *unfiltered-by-that-group*
 * set — otherwise ticking one brand would show every other brand as "0", which
 * is exactly the behaviour that makes faceted search unusable.
 */


export type PlpParams = {
  categorySlug?: string;
  /** Scopes the whole listing to one brand (the /brands/[slug] page). */
  brandScopeSlug?: string;
  sub?: string[];
  brand?: string[];
  min?: number;
  max?: number;
  /** `order` = the products NOT in stock («Παράδοση 1–3 εργάσιμες»). */
  avail?: "in-stock" | "order" | "all";
  sale?: boolean;
  isNew?: boolean;
  q?: string;
  sort?: SortValue;
  page?: number;
  perPage?: number;
  /** Milwaukee filters — see `hdc-filters.ts`. */
  platform?: Platform;
  content?: Content[];
  series?: Series[];
  /**
   * «Περισσότερα προϊόντα»: `page` N shows pages 1..N together rather than
   * page N alone, so the URL keeps how far the visitor got.
   */
  cumulative?: boolean;
};

/** Parses raw `searchParams` into a typed, clamped shape. */
export function parsePlpParams(
  raw: Record<string, string | string[] | undefined>,
  scope: {
    categorySlug?: string;
    brandScopeSlug?: string;
    /** The HDC pages: `min`/`max` are euros WITH VAT, as the cards print them. */
    grossPrices?: boolean;
    /** The HDC pages: load-more paging (see `PlpParams.cumulative`). */
    cumulative?: boolean;
  } = {},
): PlpParams {
  const list = (v: string | string[] | undefined): string[] | undefined => {
    if (v == null) return undefined;
    const items = (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean);
    return items.length ? items : undefined;
  };
  const num = (v: string | string[] | undefined): number | undefined => {
    const s = Array.isArray(v) ? v[0] : v;
    if (!s) return undefined;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : undefined;
  };
  const sortRaw = Array.isArray(raw.sort) ? raw.sort[0] : raw.sort;
  const sort = SORT_OPTIONS.some((o) => o.value === sortRaw)
    ? (sortRaw as SortValue)
    : "relevance";

  const perPageRaw = num(raw.perPage);
  const perPage = PER_PAGE_OPTIONS.includes(perPageRaw as (typeof PER_PAGE_OPTIONS)[number])
    ? (perPageRaw as number)
    : 24;

  const price = (v: number | undefined) =>
    v == null ? undefined : scope.grossPrices ? grossToNet(v, DEFAULT_VAT_RATE) : v;

  return {
    categorySlug: scope.categorySlug,
    brandScopeSlug: scope.brandScopeSlug,
    sub: list(raw.sub),
    brand: list(raw.brand),
    min: price(num(raw.min)),
    max: price(num(raw.max)),
    avail: parseAvail(raw.avail),
    platform: parsePlatform(raw.platform),
    content: parseContent(raw.content),
    series: parseSeries(raw.series),
    cumulative: scope.cumulative,
    sale: raw.sale === "1",
    isNew: raw.new === "1",
    q: (Array.isArray(raw.q) ? raw.q[0] : raw.q)?.trim() || undefined,
    sort,
    page: Math.max(1, Math.floor(num(raw.page) ?? 1)),
    perPage,
  };
}

type Scope = { categoryIds: number[]; groupIds: number[]; subgroupIds: number[] };

/**
 * The category row behind a slug, once per render.
 *
 * Three callers want the same row — the scope below, and the facet that lists
 * the category's children — and each used to look it up on its own.
 */
const categoryNode = cache(async (slug: string) =>
  prisma.category.findUnique({
    where: { slug },
    select: { id: true, erpType: true, erpCode: true },
  }),
);

/**
 * Resolves a category slug to the ERP codes it covers, including descendants —
 * a CATEGORY page must list everything under its groups and subgroups.
 */
export const resolveCategoryScope = cache(
  async (slug: string | undefined): Promise<Scope | null> => {
    if (!slug) return { categoryIds: [], groupIds: [], subgroupIds: [] };

    const root = await categoryNode(slug);
    if (!root) return null;

    const code = Number.parseInt(root.erpCode, 10);
    if (Number.isNaN(code)) return { categoryIds: [], groupIds: [], subgroupIds: [] };

    if (root.erpType === "CATEGORY") return { categoryIds: [code], groupIds: [], subgroupIds: [] };
    if (root.erpType === "GROUP") return { categoryIds: [], groupIds: [code], subgroupIds: [] };
    return { categoryIds: [], groupIds: [], subgroupIds: [code] };
  },
);

/** Maps subcategory slugs to their ERP codes, split by level. */
async function resolveSubScope(slugs: string[] | undefined): Promise<Scope> {
  const empty: Scope = { categoryIds: [], groupIds: [], subgroupIds: [] };
  if (!slugs?.length) return empty;

  const rows = await prisma.category.findMany({
    where: { slug: { in: slugs } },
    select: { erpType: true, erpCode: true },
  });

  for (const row of rows) {
    const code = Number.parseInt(row.erpCode, 10);
    if (Number.isNaN(code)) continue;
    if (row.erpType === "CATEGORY") empty.categoryIds.push(code);
    else if (row.erpType === "GROUP") empty.groupIds.push(code);
    else empty.subgroupIds.push(code);
  }
  return empty;
}

function scopeClause(scope: Scope): Prisma.ProductWhereInput | null {
  const or: Prisma.ProductWhereInput[] = [];
  if (scope.categoryIds.length) or.push({ mtrcategory: { in: scope.categoryIds } });
  if (scope.groupIds.length) or.push({ mtrgroup: { in: scope.groupIds } });
  if (scope.subgroupIds.length) or.push({ cccSubgroup2: { in: scope.subgroupIds } });
  if (or.length === 0) return null;
  return or.length === 1 ? or[0] : { OR: or };
}

type LinkedBrand = {
  mtrmark: number;
  slug: string;
  nameEl: string;
  nameEn: string;
  nameIt: string;
};

/**
 * Every brand linked to a SoftOne MTRMARK, shared across requests.
 *
 * Each listing needs it twice over: to put a brand name on every card, and to
 * turn `?brand=` slugs (and a brand page's own slug) into MTRMARK codes. It was
 * a full `brand.findMany` on every render; the brand list changes when HDCtool
 * syncs, not between two page views.
 */
const getLinkedBrands = sharedCatalogue(
  "plp-linked-brands",
  300,
  async (): Promise<LinkedBrand[]> => {
    const rows = await prisma.brand.findMany({
      where: { mtrmark: { not: null } },
      select: { mtrmark: true, slug: true, nameEl: true, nameEn: true, nameIt: true },
    });
    return rows.map((row) => ({ ...row, mtrmark: row.mtrmark! }));
  },
);

function brandLookup(
  rows: LinkedBrand[],
  locale: Locale,
): Map<number, { slug: string; name: string }> {
  return new Map(
    rows.map((b) => [
      b.mtrmark,
      {
        slug: b.slug,
        name: locale === "en" ? b.nameEn : locale === "it" ? b.nameIt : b.nameEl,
      },
    ]),
  );
}

/**
 * Everything the where clause needs from the database, looked up ONCE.
 *
 * `buildWhere` used to query for these itself, and the facets build it four
 * more times — one per excluded group — so the sub scope, the brand codes and
 * the live campaigns were each fetched up to five times for a single render.
 */
type ResolvedFilters = {
  category: Scope;
  sub: Scope;
  /** The brand page's MTRMARK; -1 for an unknown or unlinked brand, null off a brand page. */
  brandScopeMtrmark: number | null;
  /** MTRMARKs of the ticked `?brand=` slugs. */
  brandMtrmarks: number[];
  /** Live campaigns, only when `?sale=1`; null otherwise or when none is live. */
  campaigns: Prisma.ProductWhereInput | null;
  /** Size families whose OTHER sizes match `?q=` (see `searchFamiliesOf`). */
  searchFamilies: string[];
  /** Size families with at least one size in stock (see `familyStockClause`). */
  stockedFamilies: string[];
};

/** Families with any size in stock — a few dozen keys at most. */
async function stockedFamiliesOf(): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { isActive: true, inStock: true, variantGroup: { not: null } },
    distinct: ["variantGroup"],
    select: { variantGroup: true },
  });
  return rows.map((r) => r.variantGroup).filter((g): g is string => !!g);
}

/**
 * The availability filter, read per size family.
 *
 * The card of a family speaks for all its sizes, so «Άμεσα διαθέσιμα» has to
 * as well: HI-DEX gloves whose 9/L is on the shelf are in stock even when the
 * 7/S that leads the family is not — and a filter that hid them while the card
 * said «Σε απόθεμα» would contradict itself.
 */
function familyStockClause(
  avail: PlpParams["avail"],
  stockedFamilies: string[],
): Prisma.ProductWhereInput | null {
  const plain = stockClause(avail);
  if (!plain || stockedFamilies.length === 0) return plain;
  if (avail === "in-stock") {
    return { OR: [{ inStock: true }, { variantGroup: { in: stockedFamilies } }] };
  }
  return {
    inStock: false,
    OR: [{ variantGroup: null }, { variantGroup: { notIn: stockedFamilies } }],
  };
}

/**
 * Size families found through a size that is not the lead.
 *
 * The listing shows one card per family — the lead, the smallest size — and
 * the text search reads each code's own name. «hi-dex 9/l» matches the 9/L,
 * which is not listed, and not the 7/S, which is: without this the family
 * would vanish from exactly the search that names it.
 */
async function searchFamiliesOf(q: string | undefined): Promise<string[]> {
  const words = q ? searchWhere(q) : null;
  if (!words) return [];
  const rows = await prisma.product.findMany({
    where: { AND: [{ isActive: true, isVariantLead: false }, ...words.AND] },
    distinct: ["variantGroup"],
    select: { variantGroup: true },
    take: 200,
  });
  return rows.map((r) => r.variantGroup).filter((g): g is string => !!g);
}

/** Null for an unknown category slug — the caller's 404. */
async function resolveFilters(params: PlpParams): Promise<ResolvedFilters | null> {
  const category = await resolveCategoryScope(params.categorySlug);
  if (!category) return null;

  const needsBrands = Boolean(params.brandScopeSlug || params.brand?.length);
  const [sub, brands, campaigns, searchFamilies, stockedFamilies] = await Promise.all([
    resolveSubScope(params.sub),
    needsBrands ? getLinkedBrands() : Promise.resolve<LinkedBrand[]>([]),
    params.sale ? activeCampaignsWhere() : Promise.resolve(null),
    searchFamiliesOf(params.q),
    stockedFamiliesOf(),
  ]);

  const ticked = new Set(params.brand ?? []);
  return {
    category,
    sub,
    // An unknown or unlinked brand must yield nothing, not everything.
    brandScopeMtrmark: params.brandScopeSlug
      ? (brands.find((b) => b.slug === params.brandScopeSlug)?.mtrmark ?? -1)
      : null,
    brandMtrmarks: brands.filter((b) => ticked.has(b.slug)).map((b) => b.mtrmark),
    campaigns,
    searchFamilies,
    stockedFamilies,
  };
}

/**
 * Builds the where clause, optionally *excluding* one facet group so that
 * group's own counts stay meaningful. Pure: every lookup it needs is already in
 * `filters`.
 */
function buildWhere(
  params: PlpParams,
  filters: ResolvedFilters,
  exclude?: "brand" | "sub" | "price" | "avail" | "platform" | "content" | "series",
  /*
   * An outer scope the params cannot express.
   *
   * A campaign selects its products three ways — a list of slugs, a brand, a
   * category — and only the last is a URL parameter. Passing the clause in lets
   * a campaign page reuse this whole apparatus (facets, sorting, paging, and
   * the counts that stay meaningful when a facet is excluded) instead of
   * growing a second listing that drifts from it.
   */
  extraWhere?: Prisma.ProductWhereInput | null,
): Prisma.ProductWhereInput {
  /*
   * Ένα προϊόν ανά ομάδα μεγεθών.
   * ───────────────────────────────────────────────────────────────────────
   * Δεκατρία νούμερα του ίδιου παπουτσιού ήταν δεκατρείς κάρτες, που έπνιγαν
   * τη σελίδα και έδειχναν το ίδιο πράγμα δεκατρείς φορές. Ο εκπρόσωπος
   * σημειώνεται στον συγχρονισμό, οπότε εδώ αρκεί μία συνθήκη — και όσα δεν
   * ανήκουν σε ομάδα είναι εκπρόσωποι του εαυτού τους, άρα δεν χρειάζεται
   * `OR variantGroup IS NULL` που θα χαλούσε το ευρετήριο.
   */
  const and: Prisma.ProductWhereInput[] = [{ isActive: true, isVariantLead: true }];
  if (extraWhere) and.push(extraWhere);

  const categoryClause = scopeClause(filters.category);
  if (categoryClause) and.push(categoryClause);

  if (exclude !== "sub") {
    const clause = scopeClause(filters.sub);
    if (clause) and.push(clause);
  }

  if (params.brandScopeSlug) and.push({ mtrmark: filters.brandScopeMtrmark ?? -1 });

  if (exclude !== "brand" && params.brand?.length) {
    and.push({ mtrmark: { in: filters.brandMtrmarks } });
  }

  if (exclude !== "price" && (params.min != null || params.max != null)) {
    and.push({
      priceNet: {
        ...(params.min != null ? { gte: new Prisma.Decimal(params.min) } : {}),
        ...(params.max != null ? { lte: new Prisma.Decimal(params.max) } : {}),
      },
    });
  }

  if (exclude !== "avail") {
    const stock = familyStockClause(params.avail, filters.stockedFamilies);
    if (stock) and.push(stock);
  }
  and.push(...hdcFilterClauses(params, exclude));
  /*
   * "Με προσφορά" means a live CAMPAIGN, not `onSale`.
   *
   * `Product.onSale` follows `priceList`, which is deliberately never set — a
   * struck-through price derived from the gap between two SoftOne price lists
   * had 68% of the catalogue permanently reduced. So this filter matched
   * nothing at all, and ticking it produced an empty grid while two campaigns
   * were running.
   *
   * A null clause means no campaign is live, which has to become "match
   * nothing". Falling through would show the whole catalogue as on offer.
   */
  if (params.sale) and.push(filters.campaigns ?? { id: { in: [] } });
  if (params.isNew) and.push({ isNew: true });

  /*
   * Words, not a phrase: «κρουστικό δραπανοκατσάβιδο» must also find the names
   * written «ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ ΚΡΟΥΣΤΙΚΟ» — half the catalogue is written that
   * way round, and the phrase found 8 of 13.
   */
  /*
   * Each word is also accepted in its other spellings — a Greek «Μ18», a
   * glued «m18fpd3», «FPD-3» — the same reading the header dropdown uses, so
   * «see all N results» lands on N (search-query.ts).
   */
  if (params.q) {
    const words = searchWhere(params.q);
    if (words) {
      // The lead matches, or one of its other sizes does.
      if (filters.searchFamilies.length) {
        and.push({ OR: [{ AND: words.AND }, { variantGroup: { in: filters.searchFamilies } }] });
      } else {
        and.push(...words.AND);
      }
    }
  }

  return { AND: and };
}

function orderBy(sort: SortValue): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc":
      return [{ priceNet: "asc" }, { mtrl: "asc" }];
    case "price-desc":
      return [{ priceNet: "desc" }, { mtrl: "asc" }];
    case "name-asc":
      return [{ name: "asc" }, { mtrl: "asc" }];
    case "newest":
      return [{ erpInsertedAt: "desc" }, { mtrl: "desc" }];
    default:
      // "Relevance" with no query: in-stock first, then discounted, then name.
      return [{ inStock: "desc" }, { onSale: "desc" }, { name: "asc" }];
  }
}

const CARD_SELECT = {
  id: true,
  mtrl: true,
  slug: true,
  name: true,
  code: true,
  code2: true,
  mtrmark: true,
  mtrcategory: true,
  mtrgroup: true,
  cccSubgroup2: true,
  priceNet: true,
  priceList: true,
  vatRate: true,
  qty: true,
  inStock: true,
  supplierAvailable: true,
  images: { where: { isFeature: true }, take: 1, select: { url: true } },
  translations: { select: { locale: true, name: true } },
  impaCode: true,
  variantGroup: true,
  /* Μία ετικέτα αρκεί: ένας κωδικός είναι ΕΝΑ νούμερο, και η ομάδα χτίζεται
     πάνω σε αυτή την παραδοχή. */
  sizes: { select: { label: true }, orderBy: { order: "asc" }, take: 1 },
  isOneKey: true,
} as const;

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type PlpResult = {
  products: ProductCardData[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  facets: PlpFacets;
};

export async function getPlpData(
  params: PlpParams,
  locale: Locale,
  /** See `buildWhere`: the campaign scope, when this listing has one. */
  extraWhere?: Prisma.ProductWhereInput | null,
): Promise<PlpResult | null> {
  const filters = await resolveFilters(params);
  if (filters === null) return null; // unknown category slug → 404

  const where = buildWhere(params, filters, undefined, extraWhere);
  const perPage = params.perPage ?? 24;
  // Load-more renders pages 1..N at once; 60 pages (1.440 cards) is the most
  // one request will draw, whatever the URL says.
  const page = params.cumulative ? Math.min(params.page ?? 1, 60) : (params.page ?? 1);

  const [rows, total, linkedBrands] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: orderBy(params.sort ?? "relevance"),
      skip: params.cumulative ? 0 : (page - 1) * perPage,
      take: params.cumulative ? page * perPage : perPage,
      select: CARD_SELECT,
    }),
    prisma.product.count({ where }),
    getLinkedBrands(),
  ]);

  const brandByMtrmark = brandLookup(linkedBrands, locale);

  const cards: ProductCardData[] = rows.map((row) => {
    const translated = row.translations.find((t) => t.locale === locale)?.name;
    const brand = row.mtrmark != null ? brandByMtrmark.get(row.mtrmark) : undefined;
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
      supplierAvailable: row.supplierAvailable,
      scopeKey: scopeKeyOf(row),
      oneKey: row.isOneKey,
    };
  });
  const products = await withFamilies(cards, (i) => rows[i].variantGroup);

  const facets = await getFacets(facetKeyOf(params), locale, extraWhere ?? null);

  return {
    products,
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    facets,
  };
}

/**
 * The facet cache key: every parameter that changes a count, and nothing else.
 *
 * `page`, `perPage` and `sort` are left out on purpose — paging through a
 * listing or re-sorting it must hit the same entry. Multi-value lists are
 * sorted because `?brand=a,b` and `?brand=b,a` count the same products, and
 * absent values are normalised to one spelling so they share an entry too.
 */
type FacetKey = {
  categorySlug: string | null;
  brandScopeSlug: string | null;
  sub: string[] | null;
  brand: string[] | null;
  min: number | null;
  max: number | null;
  avail: "in-stock" | "order" | "all";
  sale: boolean;
  isNew: boolean;
  q: string | null;
  platform: Platform | null;
  content: Content[] | null;
  series: Series[] | null;
};

function facetKeyOf(params: PlpParams): FacetKey {
  return {
    categorySlug: params.categorySlug ?? null,
    brandScopeSlug: params.brandScopeSlug ?? null,
    sub: params.sub?.length ? [...params.sub].sort() : null,
    brand: params.brand?.length ? [...params.brand].sort() : null,
    min: params.min ?? null,
    max: params.max ?? null,
    avail: params.avail ?? "all",
    sale: Boolean(params.sale),
    isNew: Boolean(params.isNew),
    q: params.q || null,
    platform: params.platform ?? null,
    content: params.content?.length ? [...params.content] : null,
    series: params.series?.length ? [...params.series] : null,
  };
}

function paramsOfFacetKey(key: FacetKey): PlpParams {
  return {
    categorySlug: key.categorySlug ?? undefined,
    brandScopeSlug: key.brandScopeSlug ?? undefined,
    sub: key.sub ?? undefined,
    brand: key.brand ?? undefined,
    min: key.min ?? undefined,
    max: key.max ?? undefined,
    avail: key.avail,
    sale: key.sale,
    isNew: key.isNew,
    q: key.q ?? undefined,
    platform: key.platform ?? undefined,
    content: key.content ?? undefined,
    series: key.series ?? undefined,
  };
}

const NO_FACETS: PlpFacets = {
  subcategories: [],
  brands: [],
  availability: [],
  priceBounds: { min: 0, max: 0 },
  flags: { sale: 0, isNew: 0 },
  platforms: { all: 0, M12: 0, M18: 0, MX: 0 },
  content: { bare: 0, kit: 0 },
  series: { fuel: 0, onekey: 0, basic: 0 },
  stock: { inStock: 0, order: 0 },
  models: 0,
};

/**
 * Facet counts, shared across requests for five minutes.
 *
 * ── Why cached ─────────────────────────────────────────────────────────────
 *
 * They were the bulk of a listing's cost — nine aggregations plus the lookups
 * behind them, on every page view, for numbers that only move when HDCtool
 * syncs. A crawler walking filter links, or two visitors paging through the
 * same category, re-ran all of it. Paging and sorting are not in the key, so
 * page 2 of a listing reuses page 1's counts.
 *
 * ── Why at most four at a time ─────────────────────────────────────────────
 *
 * The pool is twenty connections per process on a Postgres shared by four
 * databases. Nine queries in one `Promise.all` let a single render take half
 * the pool; a cache miss now runs in two small batches.
 *
 * ── What it costs ──────────────────────────────────────────────────────────
 *
 * Counts may trail the catalogue by up to five minutes after a sync, and the
 * "με προσφορά" count by as long after a campaign starts or stops. The grid
 * itself is never cached, so the products shown are always current.
 */
const getFacets = sharedCatalogue(
  "plp-facets",
  300,
  async (
    key: FacetKey,
    locale: Locale,
    extraWhere: Prisma.ProductWhereInput | null,
  ): Promise<PlpFacets> => {
    const params = paramsOfFacetKey(key);
    // `getPlpData` has already turned an unknown category into a 404; this only
    // guards a category deleted between that check and the cache fill.
    const filters = await resolveFilters(params);
    if (!filters) return NO_FACETS;

    // Each group is counted against a where clause that drops its own filter.
    // The campaign scope goes into every facet query too. Without it the
    // counts beside each filter would describe the whole catalogue while the
    // grid shows one campaign — numbers that are wrong in the most confusing
    // possible way, because they look authoritative.
    const whereForBrands = buildWhere(params, filters, "brand", extraWhere);
    const whereForSubs = buildWhere(params, filters, "sub", extraWhere);
    const whereForPrice = buildWhere(params, filters, "price", extraWhere);
    const whereForAvail = buildWhere(params, filters, "avail", extraWhere);
    const whereForPlatform = buildWhere(params, filters, "platform", extraWhere);
    const whereForContent = buildWhere(params, filters, "content", extraWhere);
    const whereForSeries = buildWhere(params, filters, "series", extraWhere);

    /*
     * Which nodes the facet offers depends on where we are:
     *
     *  - inside a category → its direct children
     *  - on a brand page   → the root categories that brand actually covers,
     *                        since "children of nothing" would be an empty facet
     *                        and browsing a brand by category is the whole point
     *
     * Fetched first so only the ERP level those children sit at gets counted:
     * the other two groupBys produced rows nobody read, and on search and
     * "all products" — no category, no brand — none of the three was read.
     */
    const parent = params.categorySlug ? await categoryNode(params.categorySlug) : null;
    const childSelect = {
      slug: true,
      erpType: true,
      erpCode: true,
      nameEl: true,
      nameEn: true,
      nameIt: true,
    } as const;
    const childRows = parent
      ? await prisma.category.findMany({ where: { parentId: parent.id }, select: childSelect })
      : /* Search results are narrowed by category the same way («ΚΑΤΗΓΟΡΙΑ»,
           search.html section 2). */
        params.brandScopeSlug || params.q
        ? await prisma.category.findMany({
            where: { erpType: "CATEGORY", productCount: { gt: 0 } },
            select: childSelect,
          })
        : [];
    const childLevels = new Set(childRows.map((row) => row.erpType));

    const [bySubgroup, byGroup, byCategory, byBrandAndNew] = await Promise.all([
      childLevels.has("SUBGROUP")
        ? prisma.product.groupBy({ by: ["cccSubgroup2"], where: whereForSubs, _count: { _all: true } })
        : Promise.resolve([]),
      childLevels.has("GROUP")
        ? prisma.product.groupBy({ by: ["mtrgroup"], where: whereForSubs, _count: { _all: true } })
        : Promise.resolve([]),
      childLevels.has("CATEGORY")
        ? prisma.product.groupBy({ by: ["mtrcategory"], where: whereForSubs, _count: { _all: true } })
        : Promise.resolve([]),
      /* Brand counts and the "new" count share a where clause, so one groupBy
         over both columns answers both. */
      prisma.product.groupBy({
        by: ["mtrmark", "isNew"],
        where: whereForBrands,
        _count: { _all: true },
      }),
    ]);

    const [priceAgg, byStock, saleCount] = await Promise.all([
      prisma.product.aggregate({
        where: whereForPrice,
        _min: { priceNet: true },
        _max: { priceNet: true },
      }),
      /* "All" and "in stock" share a where clause too: one groupBy, two numbers. */
      prisma.product.groupBy({ by: ["inStock"], where: whereForAvail, _count: { _all: true } }),
      /*
       * Counted the same way the filter selects, or the number beside it is a
       * lie. It said 0 while the filter would have returned 3.028, because it
       * counted `onSale` — the column nothing populates. No live campaign
       * matches nothing, so there is nothing to count.
       */
      activeCampaignsWhere().then((campaigns) =>
        campaigns
          ? prisma.product.count({ where: { AND: [whereForBrands, campaigns] } })
          : 0,
      ),
    ]);

    /* The Milwaukee filters, and on search the number of distinct models. */
    const [byPlatform, byContent, bySeries, byModel] = await Promise.all([
      prisma.product.groupBy({ by: ["platform"], where: whereForPlatform, _count: { _all: true } }),
      prisma.product.groupBy({ by: ["modelContent"], where: whereForContent, _count: { _all: true } }),
      prisma.product.groupBy({
        by: ["isFuel", "isOneKey"],
        where: whereForSeries,
        _count: { _all: true },
      }),
      params.q
        ? prisma.product.groupBy({
            by: ["modelRoot"],
            where: { AND: [buildWhere(params, filters, undefined, extraWhere), { modelRoot: { not: null } }] },
          })
        : Promise.resolve([]),
    ]);

    let newCount = 0;
    const brandCounts = new Map<number, number>();
    for (const row of byBrandAndNew) {
      if (row.isNew) newCount += row._count._all;
      if (row.mtrmark != null) {
        brandCounts.set(row.mtrmark, (brandCounts.get(row.mtrmark) ?? 0) + row._count._all);
      }
    }

    let allCount = 0;
    let inStockCount = 0;
    for (const row of byStock) {
      allCount += row._count._all;
      if (row.inStock) inStockCount += row._count._all;
    }
    // A family counts as in stock when any of its sizes is (familyStockClause).
    if (filters.stockedFamilies.length > 0) {
      inStockCount = await prisma.product.count({
        where: { AND: [whereForAvail, familyStockClause("in-stock", filters.stockedFamilies)!] },
      });
    }

    const activeBrands = new Set(params.brand ?? []);
    let brands: FacetItem[] = [];
    if (!params.brandScopeSlug) {
      const brandByMtrmark = brandLookup(await getLinkedBrands(), locale);
      brands = [...brandCounts]
        .filter(([mtrmark]) => brandByMtrmark.has(mtrmark))
        .map(([mtrmark, count]) => {
          const brand = brandByMtrmark.get(mtrmark)!;
          return {
            slug: brand.slug,
            label: brand.name,
            count,
            active: activeBrands.has(brand.slug),
          };
        })
        .sort((a, b) => b.count - a.count);
    }

    // Subcategory facet: whichever level the current scope's children sit at.
    const childCodes = new Map<string, number>();
    for (const row of bySubgroup) {
      if (row.cccSubgroup2 != null) childCodes.set(`SUBGROUP:${row.cccSubgroup2}`, row._count._all);
    }
    for (const row of byGroup) {
      if (row.mtrgroup != null) childCodes.set(`GROUP:${row.mtrgroup}`, row._count._all);
    }
    for (const row of byCategory) {
      if (row.mtrcategory != null) childCodes.set(`CATEGORY:${row.mtrcategory}`, row._count._all);
    }

    const activeSubs = new Set(params.sub ?? []);
    const subcategories: FacetItem[] = childRows
      .map((row) => ({
        slug: row.slug,
        label: locale === "en" ? row.nameEn : locale === "it" ? row.nameIt : row.nameEl,
        count: childCodes.get(`${row.erpType}:${Number.parseInt(row.erpCode, 10)}`) ?? 0,
        active: activeSubs.has(row.slug),
      }))
      .filter((item) => item.count > 0 || item.active)
      .sort((a, b) => b.count - a.count);

    return {
      subcategories,
      brands,
      availability: [
        {
          slug: "all",
          label: "Όλα",
          count: allCount,
          active: params.avail !== "in-stock",
        },
        {
          slug: "in-stock",
          label: "Άμεσα διαθέσιμα",
          count: inStockCount,
          active: params.avail === "in-stock",
        },
      ],
      priceBounds: {
        min: Math.floor(num(priceAgg._min.priceNet) ?? 0),
        max: Math.ceil(num(priceAgg._max.priceNet) ?? 0),
      },
      flags: { sale: saleCount, isNew: newCount },
      platforms: platformCounts(byPlatform),
      content: contentCounts(byContent),
      series: seriesCounts(bySeries),
      stock: { inStock: inStockCount, order: allCount - inStockCount },
      models: byModel.length,
    };
  },
);

/**
 * The listing's scope before any filter — what the HDC category band counts
 * (groups, products, platforms) and what the search band describes.
 *
 * The same cached facet set a filter-free visit renders, so on the plain
 * category page it costs nothing extra.
 */
export async function getPlpSummary(
  scope: { categorySlug?: string; q?: string },
  locale: Locale,
): Promise<PlpFacets> {
  return getFacets(
    facetKeyOf({ categorySlug: scope.categorySlug, q: scope.q, avail: "all" }),
    locale,
    null,
  );
}
