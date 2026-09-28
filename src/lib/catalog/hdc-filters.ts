/**
 * The Milwaukee filters of the HDC listing pages (mockups plp.html and
 * search.html section 2): battery platform, what is in the box, the series,
 * and availability as two tick boxes.
 *
 * Pure on purpose — parsing, the where clauses and the counts are plain data
 * in and plain data out, so they are unit-tested without a database and shared
 * by the server (plp.ts) and the page components that build the links.
 *
 * Every value comes from columns the catalogue sync derives from the model code
 * (`Product.platform`, `modelContent`, `isFuel`, `isOneKey`); nobody types them.
 */

import type { Prisma } from "@/generated/prisma/client";

export const PLATFORMS = ["M12", "M18", "MX"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CONTENTS = ["bare", "kit"] as const;
export type Content = (typeof CONTENTS)[number];

/** `basic` = neither FUEL nor ONE-KEY («Βασική σειρά»). */
export const SERIES = ["fuel", "onekey", "basic"] as const;
export type Series = (typeof SERIES)[number];

/** `order` = not in stock, delivered in 1–3 working days. */
export const STOCK = ["in-stock", "order"] as const;
export type Stock = (typeof STOCK)[number];

type Raw = string | string[] | undefined;

/** Comma-separated (or repeated) values, trimmed, deduplicated, known ones only. */
function listOf<T extends string>(raw: Raw, allowed: readonly T[]): T[] | undefined {
  if (raw == null) return undefined;
  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap((v) => v.split(","))
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set<T>();
  for (const part of parts) {
    const hit = allowed.find((a) => a.toLowerCase() === part);
    if (hit) seen.add(hit);
  }
  // Canonical order, so ?series=onekey,fuel and ?series=fuel,onekey are one URL.
  const out = allowed.filter((a) => seen.has(a));
  return out.length ? out : undefined;
}

/** `?platform=M18` — one platform at a time, case-insensitive. */
export function parsePlatform(raw: Raw): Platform | undefined {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toUpperCase();
  return PLATFORMS.find((p) => p === value);
}

export function parseContent(raw: Raw): Content[] | undefined {
  const list = listOf(raw, CONTENTS);
  // Both ticked is the same as none: say so once, in one URL.
  return list && list.length < CONTENTS.length ? list : undefined;
}

export function parseSeries(raw: Raw): Series[] | undefined {
  const list = listOf(raw, SERIES);
  return list && list.length < SERIES.length ? list : undefined;
}

/**
 * `?avail=in-stock`, `?avail=order`. Both ticked means everything, so it
 * collapses to "all" — the value the rest of the PLP already understands.
 */
export function parseAvail(raw: Raw): "in-stock" | "order" | "all" {
  const list = listOf(raw, STOCK);
  return list?.length === 1 ? list[0] : "all";
}

export type HdcFilterParams = {
  platform?: Platform;
  content?: Content[];
  series?: Series[];
};

export type HdcFacetGroup = "platform" | "content" | "series";

/**
 * The where clauses for the three Milwaukee filters, leaving out `exclude` so
 * that group's own counts stay meaningful.
 */
export function hdcFilterClauses(
  params: HdcFilterParams,
  exclude?: HdcFacetGroup | string,
): Prisma.ProductWhereInput[] {
  const and: Prisma.ProductWhereInput[] = [];
  if (exclude !== "platform" && params.platform) and.push({ platform: params.platform });
  if (exclude !== "content" && params.content?.length) {
    and.push({ modelContent: { in: params.content } });
  }
  if (exclude !== "series" && params.series?.length) {
    const or: Prisma.ProductWhereInput[] = params.series.map((s) =>
      s === "fuel"
        ? { isFuel: true }
        : s === "onekey"
          ? { isOneKey: true }
          : { isFuel: false, isOneKey: false },
    );
    and.push(or.length === 1 ? or[0] : { OR: or });
  }
  return and;
}

/** Where clause for the availability boxes (null = both, or neither, ticked). */
export function stockClause(avail: "in-stock" | "order" | "all" | undefined) {
  if (avail === "in-stock") return { inStock: true };
  if (avail === "order") return { inStock: false };
  return null;
}

export type PlatformCounts = Record<"all" | Platform, number>;
export type ContentCounts = Record<Content, number>;
export type SeriesCounts = Record<Series, number>;

type Counted<T> = T & { _count: { _all: number } };

export function platformCounts(rows: Counted<{ platform: string | null }>[]): PlatformCounts {
  const out: PlatformCounts = { all: 0, M12: 0, M18: 0, MX: 0 };
  for (const row of rows) {
    out.all += row._count._all;
    const p = PLATFORMS.find((x) => x === row.platform);
    if (p) out[p] += row._count._all;
  }
  return out;
}

export function contentCounts(rows: Counted<{ modelContent: string | null }>[]): ContentCounts {
  const out: ContentCounts = { bare: 0, kit: 0 };
  for (const row of rows) {
    if (row.modelContent === "bare" || row.modelContent === "kit") {
      out[row.modelContent] += row._count._all;
    }
  }
  return out;
}

/**
 * FUEL and ONE-KEY overlap (an ONE-KEY tool is usually FUEL too), so the two
 * counts may add up to more than the total — each says how many products the
 * box on its own would show. «Βασική σειρά» is the rest: neither.
 */
export function seriesCounts(
  rows: Counted<{ isFuel: boolean; isOneKey: boolean }>[],
): SeriesCounts {
  const out: SeriesCounts = { fuel: 0, onekey: 0, basic: 0 };
  for (const row of rows) {
    if (row.isFuel) out.fuel += row._count._all;
    if (row.isOneKey) out.onekey += row._count._all;
    if (!row.isFuel && !row.isOneKey) out.basic += row._count._all;
  }
  return out;
}

/** The platforms present in a count, in display order: ["M12", "M18"]. */
export function platformsPresent(counts: PlatformCounts): Platform[] {
  return PLATFORMS.filter((p) => counts[p] > 0);
}

/** "MX" is sold and labelled as "MX FUEL". */
export function platformLabel(p: Platform): string {
  return p === "MX" ? "MX FUEL" : p;
}

/**
 * How many filters are on — the «ΦΙΛΤΡΑ (n)» of the phone bar. Each ticked box
 * counts once; a price range counts once; the platform counts once.
 */
export function activeFilterCount(raw: Record<string, Raw>): number {
  let n = 0;
  if (parsePlatform(raw.platform)) n += 1;
  n += parseContent(raw.content)?.length ?? 0;
  n += parseSeries(raw.series)?.length ?? 0;
  if (parseAvail(raw.avail) !== "all") n += 1;
  if (raw.min != null || raw.max != null) n += 1;
  const sub = Array.isArray(raw.sub) ? raw.sub.join(",") : raw.sub;
  n += sub ? sub.split(",").filter(Boolean).length : 0;
  return n;
}

/**
 * Prices in the HDC price filter are what the customer reads on the cards:
 * VAT included. The catalogue filters on net prices, so the URL's gross
 * euros are turned into net ones here and back for display.
 */
export function grossToNet(gross: number, vatRate: number): number {
  return Math.round((gross / (1 + vatRate / 100)) * 100) / 100;
}

export function netToGross(net: number, vatRate: number): number {
  return net * (1 + vatRate / 100);
}
