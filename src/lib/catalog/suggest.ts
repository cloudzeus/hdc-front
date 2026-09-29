import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import { searchKey } from "@/lib/greek";
import { displayName } from "@/lib/milwaukee/display";
import { parseModel } from "@/lib/milwaukee/model";
import { getFeaturedProducts } from "@/lib/catalog/queries";
import { onePerFamily } from "@/lib/catalog/size-family";
import { nameWithoutSize } from "@/lib/catalog/variant-name";
import {
  didYouMeanText,
  groupByModel,
  queryTokens,
  rankSimilarRoots,
  searchWhere,
  variantOf,
  type ModelVariantRow,
} from "@/lib/catalog/search-query";
import {
  EMPTY_SUGGEST,
  type SuggestProduct,
  type SuggestResult,
  type SuggestSibling,
  type SuggestTaxonomy,
  type SuggestTile,
} from "@/lib/catalog/suggest-types";
import {
  SUGGEST_ACCESSORY_LIMIT as ACCESSORY_LIMIT,
  SUGGEST_CATEGORY_LIMIT as CATEGORY_LIMIT,
  SUGGEST_DID_YOU_MEAN_LIMIT as DID_YOU_MEAN_LIMIT,
  SUGGEST_MIN_LENGTH as MIN_LENGTH,
  SUGGEST_MODEL_LIMIT as MODEL_LIMIT,
  SUGGEST_PLATFORMS,
} from "@/lib/catalog/suggest-options";

/**
 * Search-as-you-type (search.html §1, spec §8.6).
 *
 * A DELIBERATELY separate query from the results page. The listing needs
 * facets, counts, sorting and pagination; a dropdown needs a handful of rows
 * in under 100ms. Reusing `getPlpData` here would mean running nine facet
 * aggregations per keystroke.
 *
 * What the dropdown shows, in order:
 *   1. exact code — someone pasting an SKU / EAN wants that SKU, with its
 *      model's other variants beside it
 *   2. ΜΟΝΤΕΛΑ — the matches grouped by model root: «fpd» is 14 products but
 *      three rows, each with its bare tool and kits as chips
 *   3. ΑΞΕΣΟΥΑΡ ΚΑΙ ΑΝΤΑΛΛΑΚΤΙΚΑ — the matches with no model root
 *   4. categories and platforms the matches belong to
 *
 * Matching is `search-query.ts`: every word in any order, each in all of its
 * spellings (Greek «Μ18», glued «m18fpd3», «FPD-3»), over the stored
 * `searchKey` and its trigram index — the same reading as the results page,
 * so the "all N results" bar lands on N.
 *
 * Two round-trips: everything that depends only on the query in parallel,
 * then the full variants of the winning models and the category names.
 */

export { SUGGEST_MIN_LENGTH } from "@/lib/catalog/suggest-options";

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const CARD = {
  id: true,
  slug: true,
  name: true,
  code: true,
  code1: true,
  code2: true,
  mtrmark: true,
  priceNet: true,
  vatRate: true,
  qty: true,
  inStock: true,
  images: { where: { isFeature: true }, take: 1, select: { url: true } },
  translations: { select: { locale: true, name: true } },
  variantGroup: true,
  sizes: { select: { label: true }, orderBy: { order: "asc" }, take: 1 },
} as const;

const VARIANT = {
  ...CARD,
  modelRoot: true,
  modelContent: true,
  platform: true,
  erpInsertedAt: true,
} as const;

const codeCandidates = (query: string) => [
  ...new Set([query, query.toUpperCase(), query.replace(/\s/g, "")]),
];

/**
 * CODE / EAN / MPN equal to the query. 97 EANs arrive from the ERP with a
 * stray space around them, so a padded spelling is accepted too — still an
 * indexed equality, never a LIKE.
 */
function exactCodeWhere(query: string) {
  const plain = codeCandidates(query);
  const padded = [...plain, ...plain.flatMap((c) => [`${c} `, ` ${c}`])];
  return {
    isActive: true,
    OR: [{ code: { in: plain } }, { code1: { in: padded } }, { code2: { in: padded } }],
  };
}

/**
 * A product whose CODE / EAN / MPN is exactly the query.
 *
 * Shared by the header dropdown and the results page, where it drives the
 * "exact match" band: someone pasting a code from a parts list wants that part,
 * and burying it as result nine of 340 is a failure even though the search
 * technically worked.
 */
export const findByExactCode = cache(
  async (rawQuery: string, locale: Locale): Promise<SuggestProduct | null> => {
    const query = rawQuery.trim().slice(0, 64);
    if (query.length < MIN_LENGTH) return null;

    const row = await prisma.product.findFirst({ where: exactCodeWhere(query), select: CARD });
    return row ? toProduct(row, locale) : null;
  },
);

type CardRow = {
  id: string;
  slug: string;
  name: string;
  code: string;
  code2: string;
  priceNet: unknown;
  vatRate: unknown;
  qty: unknown;
  inStock: boolean;
  images: { url: string }[];
  translations: { locale: string; name: string }[];
  variantGroup?: string | null;
  sizes?: { label: string }[];
};

/** The translated name — unless it is a placeholder HDCtool left mid-run. */
const localName = (row: CardRow, locale: Locale) => {
  const name = row.translations.find((t) => t.locale === locale)?.name?.trim();
  return name && !/^PROCESSING_/.test(name) ? name : row.name;
};

function toProduct(row: CardRow, locale: Locale): SuggestProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: localName(row, locale),
    sku: row.code2 || row.code,
    mpn: row.code2 || null,
    // A Milwaukee-only shop: the brand says nothing.
    brandName: null,
    image: row.images[0]?.url ?? null,
    priceNet: num(row.priceNet),
    vatRate: num(row.vatRate) ?? 24,
    inStock: row.inStock,
    qty: num(row.qty) ?? 0,
  };
}

function toTile(row: CardRow, locale: Locale): SuggestTile {
  /* A tile stands for its whole size family (the lead): no «8/M» in the name. */
  const name = nameWithoutSize(localName(row, locale), {
    variantGroup: row.variantGroup,
    sizeLabel: row.sizes?.[0]?.label,
  });
  return {
    id: row.id,
    slug: row.slug,
    name: displayName(name, row.code2),
    sku: row.code2 || row.code,
    image: row.images[0]?.url ?? null,
    priceNet: num(row.priceNet),
    vatRate: num(row.vatRate) ?? 24,
    inStock: row.inStock,
  };
}

function toVariantRow(
  row: CardRow & {
    modelRoot: string | null;
    modelContent: string | null;
    platform: string | null;
    erpInsertedAt: Date | null;
  },
): ModelVariantRow {
  return {
    id: row.id,
    slug: row.slug,
    // The ERP name, not the translation: the model code is read from it.
    name: row.name,
    sku: row.code2 || row.code,
    modelRoot: row.modelRoot ?? "",
    platform: row.platform,
    modelContent: row.modelContent,
    image: row.images[0]?.url ?? null,
    priceNet: num(row.priceNet),
    vatRate: num(row.vatRate) ?? 24,
    inStock: row.inStock,
    qty: num(row.qty) ?? 0,
    insertedAt: row.erpInsertedAt?.getTime() ?? 0,
  };
}

/** ERP catch-all subgroups say nothing; their group says more. */
const GENERIC = new Set(["λοιπα", "διαφορα", "γενικα", "αλλα", "miscellaneous"]);

export async function getSuggestions(
  rawQuery: string,
  locale: Locale,
): Promise<SuggestResult> {
  const query = rawQuery.trim().slice(0, 64);
  const empty = EMPTY_SUGGEST(query);
  if (query.length < MIN_LENGTH) return empty;

  const words = searchWhere(query);
  if (!words) return empty;
  const tokens = queryTokens(query);
  const match = { AND: [{ isActive: true }, ...words.AND] };
  /* One hit per size family, as the results page counts them: the lead, or
     any family one of whose other sizes matches («hi-dex 9/l»). The exact-code
     lookup is not filtered — a pasted code is that size and no other. */
  const leadMatch = { AND: [match, { isVariantLead: true }] };

  // ── Round-trip 1: everything that depends only on the query ─────────────
  const [
    exactRow,
    modelRows,
    accessoryHits,
    leadTotal,
    followerFamilies,
    byClass,
    byPlatform,
    namedCategories,
  ] = await Promise.all([
      // Exact code — indexed equality, so this costs nothing even when it misses.
      prisma.product.findFirst({ where: exactCodeWhere(query), select: VARIANT }),
      // Just enough of every model match to rank the roots.
      prisma.product.findMany({
        where: { AND: [match, { modelRoot: { not: null } }] },
        select: {
          id: true,
          slug: true,
          name: true,
          modelRoot: true,
          modelContent: true,
          platform: true,
          inStock: true,
          erpInsertedAt: true,
        },
        take: 600,
      }),
      prisma.product.findMany({
        where: { AND: [match, { modelRoot: null }] },
        // In stock first: suggesting something we cannot ship is a wasted tile.
        orderBy: [{ inStock: "desc" }, { qty: "desc" }, { mtrl: "desc" }],
        // Over-fetched: five sizes of one glove fold into one tile below.
        take: ACCESSORY_LIMIT * 4,
        select: CARD,
      }),
      prisma.product.count({ where: leadMatch }),
      prisma.product.findMany({
        where: { AND: [match, { isVariantLead: false }] },
        distinct: ["variantGroup"],
        select: { variantGroup: true },
        take: 200,
      }),
      prisma.product.groupBy({
        by: ["cccSubgroup2", "mtrgroup"],
        where: leadMatch,
        _count: { _all: true },
      }),
      prisma.product.groupBy({ by: ["platform"], where: leadMatch, _count: { _all: true } }),
      prisma.category.findMany({
        where: { productCount: { gt: 0 }, nameEl: { contains: query, mode: "insensitive" } },
        orderBy: { productCount: "desc" },
        take: CATEGORY_LIMIT,
        select: { slug: true, nameEl: true, nameEn: true, nameIt: true, productCount: true },
      }),
    ]);

  const accessoryRows = onePerFamily(accessoryHits).slice(0, ACCESSORY_LIMIT);
  // The results page's count: leads that match, plus families found through
  // another size (plp.ts `searchFamiliesOf`).
  const families = followerFamilies.map((r) => r.variantGroup).filter((g): g is string => !!g);
  const total = families.length
    ? await prisma.product.count({
        where: {
          AND: [
            { isActive: true, isVariantLead: true },
            { OR: [{ AND: words.AND }, { variantGroup: { in: families } }] },
          ],
        },
      })
    : leadTotal;

  const ranked = groupByModel(
    modelRows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      sku: "",
      modelRoot: row.modelRoot!,
      platform: row.platform,
      modelContent: row.modelContent,
      image: null,
      priceNet: null,
      vatRate: 24,
      inStock: row.inStock,
      qty: 0,
      insertedAt: row.erpInsertedAt?.getTime() ?? 0,
    })),
    tokens,
  );
  const exactRoot = exactRow?.modelRoot ?? null;
  // The exact hit's own model is already shown, as «ΤΟ ΙΔΙΟ ΜΟΝΤΕΛΟ».
  const topRoots = ranked
    .filter((g) => g.root !== exactRoot)
    .slice(0, MODEL_LIMIT)
    .map((g) => g.root);
  const roots = [...new Set([...topRoots, ...(exactRoot ? [exactRoot] : [])])];

  /* Category of the matches: the subgroup, or its group when the subgroup is a
     catch-all («ΛΟΙΠΑ»). Counted per resulting category. */
  const classes = [...byClass].sort((a, b) => b._count._all - a._count._all).slice(0, 12);
  const subCodes = [...new Set(classes.map((c) => c.cccSubgroup2).filter((c): c is number => c != null))];
  const groupCodes = [...new Set(classes.map((c) => c.mtrgroup).filter((c): c is number => c != null))];

  // ── Round-trip 2: the winning models in full, the category names ────────
  const [variantRows, categoryRows, similar] = await Promise.all([
    roots.length
      ? prisma.product.findMany({
          where: { isActive: true, modelRoot: { in: roots } },
          select: VARIANT,
        })
      : Promise.resolve([]),
    subCodes.length || groupCodes.length
      ? prisma.category.findMany({
          where: {
            productCount: { gt: 0 },
            OR: [
              { erpType: "SUBGROUP", erpCode: { in: subCodes.map(String) } },
              { erpType: "GROUP", erpCode: { in: groupCodes.map(String) } },
            ],
          },
          select: {
            slug: true,
            erpType: true,
            erpCode: true,
            nameEl: true,
            nameEn: true,
            nameIt: true,
            productCount: true,
          },
        })
      : Promise.resolve([]),
    total === 0 && !exactRow ? similarRoots(query) : Promise.resolve([]),
  ]);

  // Models, in the order round-trip 1 ranked them.
  const full = groupByModel(variantRows.map(toVariantRow), tokens);
  const models = topRoots
    .map((root) => full.find((g) => g.root === root))
    .filter((g) => g != null);

  // Exact hit and «ΤΟ ΙΔΙΟ ΜΟΝΤΕΛΟ».
  let exact: SuggestResult["exact"] = null;
  let siblings: SuggestSibling[] = [];
  if (exactRow) {
    const variant = exactRow.modelRoot ? variantOf(toVariantRow(exactRow)) : null;
    exact = { ...toProduct(exactRow, locale), variant };
    if (exactRoot) {
      siblings = variantRows
        .filter((row) => row.modelRoot === exactRoot && row.id !== exactRow.id)
        .map((row) => {
          const vr = toVariantRow(row);
          return {
            slug: row.slug,
            code: parseModel(row.name)?.code ?? exactRoot,
            image: vr.image,
            variant: variantOf(vr),
          };
        })
        .sort((a, b) => (a.variant.priceNet ?? Infinity) - (b.variant.priceNet ?? Infinity));
    }
  }

  // Categories: named ones first (the query IS a category), then the ones the
  // matches sit in, by how many of them.
  const bySub = new Map(
    categoryRows.filter((c) => c.erpType === "SUBGROUP").map((c) => [c.erpCode, c]),
  );
  const byGroup = new Map(
    categoryRows.filter((c) => c.erpType === "GROUP").map((c) => [c.erpCode, c]),
  );
  const counted = new Map<string, SuggestTaxonomy>();
  for (const c of classes) {
    const sub = c.cccSubgroup2 != null ? bySub.get(String(c.cccSubgroup2)) : undefined;
    const node =
      sub && !GENERIC.has(searchKey(sub.nameEl))
        ? sub
        : c.mtrgroup != null
          ? byGroup.get(String(c.mtrgroup))
          : undefined;
    if (!node) continue;
    const prev = counted.get(node.slug);
    if (prev) prev.count += c._count._all;
    else counted.set(node.slug, { slug: node.slug, name: pick(node, locale), count: c._count._all });
  }
  const categories: SuggestTaxonomy[] = [];
  for (const c of [
    ...namedCategories.map((c) => ({ slug: c.slug, name: pick(c, locale), count: c.productCount })),
    ...[...counted.values()].sort((a, b) => b.count - a.count),
  ]) {
    if (categories.length >= CATEGORY_LIMIT) break;
    if (!categories.some((x) => x.slug === c.slug)) categories.push(c);
  }

  const present = new Set(
    byPlatform.filter((p) => p.platform && p._count._all > 0).map((p) => p.platform!),
  );

  return {
    query,
    tokens,
    exact,
    siblings,
    models,
    accessories: accessoryRows.map((row) => toTile(row, locale)),
    categories,
    platforms: SUGGEST_PLATFORMS.filter((p) => present.has(p)),
    didYouMean: similar,
    totalProducts: total,
  };
}

/**
 * «ΜΗΠΩΣ ΕΝΝΟΕΙΤΕ»: the model roots closest to what was typed, by pg_trgm
 * character similarity on the root — not a guess, and not a spelling list.
 */
async function similarRoots(query: string): Promise<string[]> {
  const text = didYouMeanText(query);
  if (!text) return [];
  const rows = await prisma.$queryRaw<
    Array<{ root: string; sim: number; count: number; inStock: boolean }>
  >`
    SELECT "modelRoot" AS root,
           similarity("modelRoot", ${text})::float8 AS sim,
           count(*)::int AS count,
           bool_or("inStock") AS "inStock"
      FROM products
     WHERE "isActive" AND "modelRoot" IS NOT NULL
       AND similarity("modelRoot", ${text}) > 0.2
     GROUP BY "modelRoot"
     ORDER BY sim DESC
     LIMIT 20`;
  return rankSimilarRoots(rows, DID_YOU_MEAN_LIMIT);
}

/** The did-you-mean chips for the zero-results page. */
export const getDidYouMean = cache(async (query: string): Promise<string[]> => {
  try {
    return await similarRoots(query.trim().slice(0, 64));
  } catch (error) {
    // A missing pg_trgm must cost the chips, never the page.
    console.warn("[search] did-you-mean unavailable:", (error as Error).message);
    return [];
  }
});

/**
 * «ΔΗΜΟΦΙΛΗ» / «ΑΥΤΑ ΑΓΟΡΑΖΟΥΝ ΟΙ ΠΕΛΑΤΕΣ ΜΑΣ»: the same source as the home
 * page's best sellers, so the three lists never disagree.
 */
export async function getPopularTiles(locale: Locale, limit = 5): Promise<SuggestTile[]> {
  const products = await getFeaturedProducts(locale, limit, 2, true);
  return products.slice(0, limit).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: displayName(p.name, p.sku),
    sku: p.sku,
    image: p.image,
    priceNet: p.priceNet,
    vatRate: p.vatRate,
    inStock: p.inStock,
  }));
}

function pick(
  row: { nameEl: string; nameEn: string; nameIt: string },
  locale: Locale,
): string {
  if (locale === "en") return row.nameEn || row.nameEl;
  if (locale === "it") return row.nameIt || row.nameEl;
  return row.nameEl;
}
