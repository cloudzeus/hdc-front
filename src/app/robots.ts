import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo/urls";
import { AI_CRAWLERS, indexingAllowed } from "@/lib/seo/indexing";
import { facetRules, privateRules } from "@/lib/seo/robots-rules";

/*
 * Built per request, not at build time: the switch below is a runtime variable,
 * and a robots.txt baked during `next build` would keep saying "blocked" after
 * go-live (or, worse, "open" on a new staging copy).
 */
export const dynamic = "force-dynamic";

/**
 * What a crawler may take.
 *
 * While the shop is not on its final domain (`SITE_INDEXING` is not "on"),
 * nothing: every crawler, and each common AI crawler by name, gets
 * `Disallow: /`. No sitemap and no host line either — the sitemap and the
 * Merchant feeds stay reachable for whoever already knows their address, but
 * robots.txt does not advertise them.
 *
 * Once live, everything on the storefront is open. What is closed is closed
 * for a reason and not out of caution:
 *
 *   /admin        staff only, and behind auth anyway
 *   /api          machine surfaces; the agent API is metered per key
 *   /kalathi      a basket is one visitor's, and every crawl of it is a session
 *   /checkout     the same, plus it would index a form
 *   /logariasmos  somebody's orders and addresses
 *
 * Each of them under /en and /it as well: a basket one prefix away is still a
 * basket (`privateRules`).
 *
 * The confirmation page is excluded through /checkout. It carries a guest token
 * in the query string, so an indexed copy would be a stranger's order with the
 * key attached.
 *
 * ── Filtered listings ──────────────────────────────────────────────────────
 *
 * A category, a brand, "all products" and an offer are crawlable, and so is
 * their `?page=`. Every OTHER query on them — facets, platform, price, sort,
 * density — is disallowed, in every locale prefix. They used to be left to
 * canonicals alone, on the theory that a canonical can tell a useful filter
 * from an infinite one; but every combination is a full server render, and a
 * crawler that respects robots.txt has no business walking them (the Kolleris
 * shop this one was copied from was taken down by a facet walk). The pages
 * still say `noindex, follow` with a canonical to the unfiltered listing, for
 * the crawler that arrives anyway through a link. Longest match wins: see
 * `facetRules` (src/lib/seo/robots-rules.ts).
 */
export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) {
    return {
      rules: [
        { userAgent: "*", disallow: "/" },
        ...AI_CRAWLERS.map((userAgent) => ({ userAgent, disallow: "/" })),
      ],
    };
  }

  const facets = facetRules();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", ...facets.allow],
        disallow: [...privateRules().disallow, ...facets.disallow],
      },
    ],
    sitemap: `${siteOrigin()}/sitemap.xml`,
    // The Merchant Center feed is fetched by Google on a schedule it is given
    // in the Merchant Center account, not discovered here — it is listed so a
    // person reading robots.txt can find it, and left crawlable so a fetch does
    // not have to be whitelisted.
    host: siteOrigin(),
  };
}
