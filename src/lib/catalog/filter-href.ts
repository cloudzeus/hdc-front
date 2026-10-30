/**
 * URL builders for the filter controls.
 *
 * Pure functions over `searchParams`, so every filter can be a plain `<a>`
 * rendered on the server. That is what lets the sidebar and toolbar carry no
 * client JavaScript at all — the browser's own navigation does the work that
 * would otherwise need `router.push` and a hydrated component.
 */

import { toggleCappedValue, trimToFacetCap } from "@/lib/catalog/listing-query";

export type RawParams = Record<string, string | string[] | undefined>;

function toSearchParams(raw: RawParams): URLSearchParams {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    next.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  return next;
}

/**
 * Defaults are not spelled out: the canonical URL is the one without them
 * (listing-query.ts), and a link that spelled them would cost a redirect.
 */
function withoutDefaults(basePath: string, next: URLSearchParams): string {
  if (next.get("page") === "1") next.delete("page");
  if (next.get("perPage") === "24") next.delete("perPage");
  if (next.get("sort") === "relevance") next.delete("sort");
  /* The combined facet cap, trimmed the way the proxy trims it. The cap is the
     most the filters can produce, so this only ever bites on a link built
     from a legacy URL — but then the link is canonical too. */
  const query = new URLSearchParams(trimToFacetCap([...next.entries()])).toString();
  return query ? `${basePath}?${query}` : basePath;
}

function finish(basePath: string, next: URLSearchParams): string {
  // Any filter change returns to page 1 — staying on page 7 of a result set
  // that just shrank to 2 pages is how people land on an empty grid.
  next.delete("page");
  return withoutDefaults(basePath, next);
}

/** Toggles one value inside a comma-separated multi-select param. */
export function toggleMultiHref(
  basePath: string,
  raw: RawParams,
  key: "sub" | "brand" | "content" | "series" | "avail",
  slug: string,
  /*
   * Every value the group has. Ticking the last unticked box selects
   * everything, which is the same as no filter — so the param goes, rather
   * than leaving a URL whose boxes all read "on" and filter nothing.
   */
  all?: readonly string[],
): string {
  const next = toSearchParams(raw);
  const values = (next.get(key) ?? "").split(",").filter(Boolean);

  if (all) {
    // A closed list (availability, content, series): its own order, no cap
    // needed — two or three values, and all of them is no filter at all.
    const current = new Set(values);
    if (current.has(slug)) current.delete(slug);
    else current.add(slug);
    const everything = all.every((value) => current.has(value));
    if (current.size && !everything) next.set(key, all.filter((v) => current.has(v)).join(","));
    else next.delete(key);
    return finish(basePath, next);
  }

  /* Slugs: sorted and capped exactly as the proxy would canonicalise them, so
     a click never costs a redirect. At the cap the new value stays and the
     oldest goes: that is what the person who just ticked it meant. */
  const toggled = toggleCappedValue(values, slug);
  if (toggled.length) next.set(key, toggled.join(","));
  else next.delete(key);
  return finish(basePath, next);
}

/** Sets or clears a price band. Passing the currently active band clears it. */
export function priceHref(
  basePath: string,
  raw: RawParams,
  band: { min: number | null; max: number | null },
  active: boolean,
): string {
  const next = toSearchParams(raw);
  if (active) {
    next.delete("min");
    next.delete("max");
  } else {
    if (band.min != null) next.set("min", String(band.min));
    else next.delete("min");
    if (band.max != null) next.set("max", String(band.max));
    else next.delete("max");
  }
  return finish(basePath, next);
}

export function isPriceBandActive(
  raw: RawParams,
  band: { min: number | null; max: number | null },
): boolean {
  const min = Array.isArray(raw.min) ? raw.min[0] : raw.min;
  const max = Array.isArray(raw.max) ? raw.max[0] : raw.max;
  return (band.min == null ? !min : min === String(band.min)) &&
    (band.max == null ? !max : max === String(band.max));
}

/** Sets a single-value param, or removes it when `value` is null. */
export function setParamHref(
  basePath: string,
  raw: RawParams,
  key: string,
  value: string | null,
): string {
  const next = toSearchParams(raw);
  if (value == null) next.delete(key);
  else next.set(key, value);
  return finish(basePath, next);
}

/** Same as `setParamHref` but keeps the current page — used by density controls. */
export function setParamKeepingPage(
  basePath: string,
  raw: RawParams,
  key: string,
  value: string,
): string {
  const next = toSearchParams(raw);
  next.set(key, value);
  return withoutDefaults(basePath, next);
}

export function clearAllHref(basePath: string): string {
  return basePath;
}
