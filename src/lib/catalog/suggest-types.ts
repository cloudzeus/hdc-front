/**
 * Suggest wire types.
 *
 * Split from `suggest.ts` (which is `server-only` — it touches Prisma) so the
 * header dropdown can import the shapes it renders. Same split as
 * `cart/options.ts` and `compare/options.ts`.
 */

import type { ModelGroup, ModelVariant } from "@/lib/catalog/search-query";

export type { ModelGroup as SuggestModel, ModelVariant as SuggestVariant };

export type SuggestProduct = {
  id: string;
  slug: string;
  name: string;
  /** Kolleris code. */
  sku: string;
  /** Manufacturer code, when it differs. */
  mpn: string | null;
  brandName: string | null;
  image: string | null;
  priceNet: number | null;
  vatRate: number;
  inStock: boolean;
  qty: number;
};

/** A tile: an accessory, a spare part, a popular product. */
export type SuggestTile = {
  id: string;
  slug: string;
  /** Display name — no article number, no brand. */
  name: string;
  sku: string;
  image: string | null;
  priceNet: number | null;
  vatRate: number;
  inStock: boolean;
};

/** Another variant of the exact hit's model («ΤΟ ΙΔΙΟ ΜΟΝΤΕΛΟ»). */
export type SuggestSibling = {
  slug: string;
  /** "M18 FPD3-502X" */
  code: string;
  image: string | null;
  variant: ModelVariant;
};

export type SuggestTaxonomy = {
  slug: string;
  name: string;
  count: number;
};

export type SuggestResult = {
  query: string;
  /** The query read as words × spellings — drives the highlight. */
  tokens: string[][];
  /** Set when the query is an exact CODE / EAN / MPN. */
  exact: (SuggestProduct & { variant: ModelVariant | null }) | null;
  siblings: SuggestSibling[];
  /** One row per model root, up to three. */
  models: ModelGroup[];
  /** Matches without a model root — accessories and spare parts, up to four. */
  accessories: SuggestTile[];
  categories: SuggestTaxonomy[];
  /** Platforms present among the matches: "M12" | "M18" | "MX". */
  platforms: string[];
  /** Closest model roots, when nothing matched. */
  didYouMean: string[];
  /** Everything matching — drives the "see all" bar. */
  totalProducts: number;
};

export const EMPTY_SUGGEST = (query: string): SuggestResult => ({
  query,
  tokens: [],
  exact: null,
  siblings: [],
  models: [],
  accessories: [],
  categories: [],
  platforms: [],
  didYouMean: [],
  totalProducts: 0,
});
