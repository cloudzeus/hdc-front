import { routing } from "@/i18n/routing";

/**
 * The robots.txt rules that are generated rather than listed, kept out of
 * `app/robots.ts` so they can be tested without the metadata route.
 */

/** "" for Greek (served from the bare path), then `/en`, `/it`. */
export const LOCALE_PREFIXES = [
  "",
  ...routing.locales
    .filter((locale) => locale !== routing.defaultLocale)
    .map((locale) => `/${locale}`),
];

/** Listing paths whose query string is a facet space. `*` is the slug. */
const LISTINGS = ["/katalogos/*", "/brands/*", "/proionta", "/prosfores/*"];

/** The listing that has platform landings: the category page. */
const PLATFORM_LISTING = "/katalogos/*";

/**
 * Any query on a listing, except a lone `?page=` — and on a category, a lone
 * `?platform=` (a platform landing, see `isFilteredListing`) with or without
 * its `page`.
 *
 * Google and Bing pick the MOST SPECIFIC (longest) matching rule, and a tie
 * goes to Allow:
 *
 *   Disallow /katalogos/*?                 any query …
 *   Allow    /katalogos/*?page=             … except one that starts with page= …
 *   Disallow /katalogos/*?page=*=          … and has no second parameter.
 *
 * A second parameter always brings its own `=`, so `*=` is how a rule says
 * "and then another parameter". Never `&`: Next writes robots.txt with `&`
 * escaped as `&amp;`, and a rule containing it matches nothing (found on the
 * Kolleris shop). No rule here contains `&`, `<`, `>`, `"` or `'`.
 *
 * The platform landing, in both orders of its two parameters:
 *
 *   Allow    ?platform=                     a platform …
 *   Disallow ?platform=*=                   … alone,
 *   Allow    ?platform=*page=               … or followed by its page …
 *   Disallow ?platform=*page=*=             … and nothing after it,
 *   Disallow ?platform=*=*page=             … and nothing between them;
 *   Allow    ?page=*platform=               the page first, then the platform …
 *   Disallow ?page=*platform=*=             … and nothing after it,
 *   Disallow ?page=*=*platform=             … and nothing between them.
 */
export function facetRules(): { allow: string[]; disallow: string[] } {
  const allow: string[] = [];
  const disallow: string[] = [];
  for (const prefix of LOCALE_PREFIXES) {
    for (const listing of LISTINGS) {
      const base = `${prefix}${listing}`;
      disallow.push(`${base}?`, `${base}?page=*=`);
      allow.push(`${base}?page=`);
    }
    const category = `${prefix}${PLATFORM_LISTING}`;
    allow.push(`${category}?platform=`, `${category}?platform=*page=`, `${category}?page=*platform=`);
    disallow.push(
      `${category}?platform=*=`,
      `${category}?platform=*page=*=`,
      `${category}?platform=*=*page=`,
      `${category}?page=*platform=*=`,
      `${category}?page=*=*platform=`,
    );
  }
  return { allow, disallow };
}

/**
 * Private pages, in every language.
 *
 * Only the bare paths used to be listed, so `/en/kalathi`, `/it/checkout` and
 * the rest were open to every crawler — the same basket and the same account
 * pages, one prefix away. `/admin` and `/api` are not localised and stay as
 * they are.
 */
const PRIVATE_LOCALISED = ["/kalathi", "/checkout", "/logariasmos", "/eisodos", "/eggrafi"];
const NOT_LOCALISED = ["/admin", "/api"];

export function privateRules(): { disallow: string[] } {
  const disallow = [...NOT_LOCALISED];
  for (const prefix of LOCALE_PREFIXES) {
    for (const path of PRIVATE_LOCALISED) disallow.push(`${prefix}${path}`);
  }
  return { disallow };
}
