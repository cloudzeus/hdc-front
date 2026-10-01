import NextAuth from "next-auth";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { routing } from "@/i18n/routing";
import {
  PER_ROW_COOKIE,
  canonicalizeListingQuery,
  listingKindOf,
} from "@/lib/catalog/listing-query";
import {
  POLICIES,
  TokenBucketLimiter,
  clientIp,
  policyFor,
} from "@/lib/security/rate-limit";
import { tinyPage } from "@/lib/security/tiny-response";
import { indexingAllowed, NOINDEX_HEADER } from "@/lib/seo/indexing";
import { isAliasHost } from "@/lib/seo/canonical-host";
import {
  createMagentoResolver,
  isMagentoCandidate,
  type MagentoTable,
} from "@/lib/seo/magento-redirects";
import { createManualRedirectCache } from "@/lib/seo/manual-redirects";
import { MOVED } from "@/lib/seo/moved-paths";

// Edge-safe: authConfig carries no providers and no database access.
const { auth } = NextAuth(authConfig);
const intlMiddleware = createIntlMiddleware(routing);

/**
 * Το κανονικό host του καταστήματος, από τη ΜΙΑ ρύθμιση που ορίζει και τα
 * canonical, το sitemap και τα δομημένα δεδομένα. Κενό όταν δεν έχει οριστεί —
 * δηλαδή σε ανάπτυξη — και τότε δεν ανακατευθύνεται τίποτα.
 */
const CANONICAL_HOST = (() => {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/[\s,;]+$/, "");
  if (!raw?.startsWith("https://")) return "";
  try {
    return new URL(raw).host;
  } catch {
    return "";
  }
})();

/**
 * Ένα κατάστημα, ένα όνομα.
 *
 * Το apex και το `www.` δείχνουν στον ίδιο container. Για μια μηχανή
 * αναζήτησης δύο ονόματα με το ίδιο περιεχόμενο είναι δύο αντίγραφα που
 * ανταγωνίζονται· για έναν πελάτη δύο καλάθια και δύο συνδέσεις, αφού τα
 * cookies ανήκουν στο host. Ποια ονόματα διπλώνονται το αποφασίζει το
 * `isAliasHost` από το ίδιο το κανονικό host — όχι μια λίστα (ο κανόνας που
 * αντιγράφηκε από την Kolleris έπιανε το `*.kolleris.com`).
 *
 * 301 και όχι 307: η ανακατεύθυνση είναι μόνιμη και θέλουμε οι μηχανές να
 * μεταφέρουν την αξία της παλιάς διεύθυνσης στη νέα.
 */
function canonicalHostRedirect(request: NextRequest): NextResponse | null {
  if (!CANONICAL_HOST) return null;
  const host = request.headers.get("host");
  if (!host || !isAliasHost(host, CANONICAL_HOST)) return null;

  const url = new URL(request.nextUrl);
  url.host = CANONICAL_HOST;
  url.protocol = "https:";
  url.port = "";
  return NextResponse.redirect(url, 301);
}

/**
 * Όταν το αίτημα ήρθε στο `www.`, η ανακατεύθυνση πηγαίνει κατευθείαν στο
 * κανονικό host: ένα βήμα, όχι δύο.
 */
function onCanonicalHost(url: URL, request: NextRequest): URL {
  const host = request.headers.get("host");
  if (CANONICAL_HOST && host && isAliasHost(host, CANONICAL_HOST)) {
    url.host = CANONICAL_HOST;
    url.protocol = "https:";
    url.port = "";
  }
  return url;
}

/**
 * Οι χειροκίνητες 301 του διαχειριστικού (`RedirectRule`) — ΠΡΩΤΕΣ, πριν από
 * τον πίνακα του Magento, ώστε ένας άνθρωπος να μπορεί πάντα να διορθώσει μια
 * αυτόματη αντιστοίχιση.
 *
 * Από τη μνήμη, όχι από τη βάση ανά αίτημα: οι κανόνες φορτώνονται μία φορά
 * και ανανεώνονται στο παρασκήνιο όταν περάσει ένα λεπτό
 * (src/lib/seo/manual-redirects.ts). Το Prisma φορτώνεται τεμπέλικα, την πρώτη
 * φορά που χρειάζεται. Οι παράμετροι του αιτήματος (utm_*, gclid) μένουν.
 */
const manualRules = createManualRedirectCache({
  load: async () => (await import("@/lib/seo/manual-redirects-db")).loadManualRules(),
});

async function manualRedirect(request: NextRequest): Promise<NextResponse | null> {
  const { pathname, searchParams } = request.nextUrl;
  // A page is fetched with GET/HEAD; a form post or an API call is never redirected.
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (pathname.startsWith("/admin")) return null;
  const hit = (await manualRules())(pathname);
  if (!hit) return null;
  void import("@/lib/seo/manual-redirects-db").then((db) => db.recordManualHit(hit.id));

  const url = onCanonicalHost(new URL(hit.to, request.nextUrl), request);
  for (const [key, value] of searchParams) {
    if (!url.searchParams.has(key)) url.searchParams.append(key, value);
  }
  return NextResponse.redirect(url, 301);
}

/**
 * Σελίδες του νέου καταστήματος που μετακόμισαν οριστικά: 301, με το πρόθεμα
 * γλώσσας και τις παραμέτρους του αιτήματος. Η σελίδα της μάρκας Milwaukee
 * είναι πια η κεντρική σελίδα `/milwaukee` (σχέδιο 8, Task 8).
 */
function movedRedirect(request: NextRequest): NextResponse | null {
  const match = /^(\/(?:en|it))?(\/.*?)\/*$/.exec(request.nextUrl.pathname);
  const to = match ? MOVED[match[2].toLowerCase()] : undefined;
  if (!match || !to) return null;
  const url = onCanonicalHost(new URL(`${match[1] ?? ""}${to}`, request.nextUrl), request);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 301);
}

/**
 * Οι παλιές διευθύνσεις του milwaukeetoolshdc.gr (Magento) → οι νέες.
 *
 * Ο πίνακας (src/config/magento-redirects.json, από το
 * scripts/seo/magento-redirects.ts) φορτώνεται την πρώτη φορά που έρχεται
 * διεύθυνση με σχήμα Magento, και οι Maps του χτίζονται μία φορά. Μια κανονική
 * σελίδα του καταστήματος δεν περνά καν από εδώ: το `isMagentoCandidate`
 * απορρίπτει κάθε δική μας διαδρομή πριν αγγίξει τον πίνακα.
 *
 * - Ακριβές ταίριασμα (προϊόν, κατηγορία, σελίδα): 301.
 * - Καταφυγή στην αναζήτηση: 302 — δεν είναι μόνιμη αντιστοίχιση, και όταν
 *   μπει το προϊόν στον κατάλογο η ίδια παλιά διεύθυνση πρέπει να βρει αυτό.
 * - Οι παράμετροι του αιτήματος (utm_*, gclid, fbclid) μένουν, εκτός από τις
 *   παραμέτρους αναζήτησης του Magento που έγιναν ήδη το `q`.
 * - Σε `www.` πηγαίνει κατευθείαν στο κανονικό host: ένα βήμα, όχι δύο.
 */
let magentoResolver: Promise<ReturnType<typeof createMagentoResolver>> | null = null;

const MAGENTO_SEARCH_PARAMS = new Set(["q", "query", "text"]);

async function magentoRedirect(request: NextRequest): Promise<NextResponse | null> {
  const { pathname, search, searchParams } = request.nextUrl;
  if (!isMagentoCandidate(pathname)) return null;
  magentoResolver ??= import("@/config/magento-redirects.json").then((table) =>
    createMagentoResolver(table.default as unknown as MagentoTable),
  );
  const hit = (await magentoResolver)(pathname, search);
  if (!hit) return null;

  const url = onCanonicalHost(new URL(hit.to, request.nextUrl), request);
  for (const [key, value] of searchParams) {
    if (hit.kind === "search" && MAGENTO_SEARCH_PARAMS.has(key)) continue;
    if (!url.searchParams.has(key)) url.searchParams.append(key, value);
  }
  return NextResponse.redirect(url, hit.kind === "search" ? 302 : 301);
}

/**
 * One spelling per listing URL — before auth, i18n and any render.
 *
 * The facet space used to be infinite: every random `sub`/`brand`/`min`/`max`/
 * `perPage`/`series`/`content` combination was a cache miss and a full render
 * (the Kolleris shop this one was copied from was taken down that way on
 * 1/10/2026). `canonicalizeListingQuery` reduces the query to the parameters
 * the page reads, with their values in one order and within limits (the
 * parameters' own order is left alone); here the answer is turned into
 * a 301 to the canonical URL that costs nothing (307 when it carries a
 * `perRow` preference — that one sets a cookie and must not be cached). There
 * is no refusal: over-cap filters are trimmed, a page past the end is clamped,
 * an over-long search is cut; the page renders the nearest real listing.
 *
 * GET and HEAD only: a Server Action is a POST to the page's own URL, and
 * redirecting it would turn the action into a page load.
 *
 * The target is built on `request.nextUrl`, so it is same-origin by
 * construction; Next writes a same-origin redirect out as a relative Location,
 * so the host the platform hands the server never leaks into it. (A raw
 * relative `Location` header is rejected by the proxy adapter: it parses it
 * with `new URL()`.) A canonical query that equals the request's is never
 * redirected, so no listing URL can redirect to itself.
 */
function listingCanonicalRedirect(request: NextRequest): NextResponse | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const { pathname, search } = request.nextUrl;
  if (!search) return null;
  const kind = listingKindOf(pathname);
  if (!kind) return null;

  const result = canonicalizeListingQuery(kind, request.nextUrl.searchParams);
  if (result.action === "ok") return null;

  /* A density preference on www.: the apex first, query untouched, so the
     cookie is set on the host the visitor will actually stay on. */
  if (result.perRow != null) {
    const toApex = canonicalHostRedirect(request);
    if (toApex) return toApex;
  }

  const target = new URL(request.nextUrl);
  target.search = result.search;
  if (target.search === request.nextUrl.search && result.perRow == null) return null;
  // On `www.` straight to the canonical host: one hop, not two.
  onCanonicalHost(target, request);

  if (result.perRow != null) {
    const response = NextResponse.redirect(target, 307);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(PER_ROW_COOKIE, String(result.perRow), {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return response;
  }
  const response = NextResponse.redirect(target, 301);
  // Cacheable, briefly: the rules are new and may still be tuned.
  response.headers.set("Cache-Control", "public, max-age=600");
  return response;
}

/**
 * Per-IP rate limit on the routes that cost a render (see `rate-limit.ts` for
 * the policies). One limiter per process: the proxy runs in the server's Node
 * runtime and its module lives as long as the server does.
 */
const limiter = new TokenBucketLimiter();

/*
 * What was refused, summarised once a minute. Logging every 429 during an
 * attack would be its own load; a count and the top offenders is what someone
 * reading the log needs.
 */
const refused = new Map<string, number>();
let refusedSince = Date.now();

function noteRefused(ip: string): void {
  refused.set(ip, (refused.get(ip) ?? 0) + 1);
  const now = Date.now();
  if (now - refusedSince < 60_000) return;
  const total = [...refused.values()].reduce((a, b) => a + b, 0);
  const top = [...refused]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([who, n]) => `${who}=${n}`)
    .join(" ");
  console.warn(
    `[rate-limit] refused ${total} requests from ${refused.size} clients in ${Math.round((now - refusedSince) / 1000)}s; top: ${top}`,
  );
  refused.clear();
  refusedSince = now;
}

/**
 * Over the limit: 429 with `Retry-After` and a few hundred static bytes
 * (`noindex`), before auth, i18n, the redirect tables or any render. Requests
 * that carry no client address (the container's own health check) and
 * anything but GET/HEAD (Server Actions, the cart) are never limited.
 */
function rateLimit(request: NextRequest): NextResponse | null {
  const policy = policyFor({
    method: request.method,
    pathname: request.nextUrl.pathname,
    searchParams: request.nextUrl.searchParams,
    headers: request.headers,
  });
  if (!policy) return null;
  const ip = clientIp(request.headers);
  if (!ip) return null;

  const verdict = limiter.take(`${policy}:${ip}`, POLICIES[policy]);
  if (verdict.ok) return null;

  noteRefused(ip);
  const headers = { "Retry-After": String(verdict.retryAfterSeconds) };
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "rate_limited", retry_after_seconds: verdict.retryAfterSeconds },
      { status: 429, headers: { ...headers, "Cache-Control": "no-store" } },
    );
  }
  return tinyPage(429, {
    title: "Too many requests",
    message:
      "Πάρα πολλά αιτήματα σε λίγο χρόνο — δοκιμάστε ξανά σε λίγα δευτερόλεπτα. / Too many requests — please try again in a few seconds.",
    headers,
  });
}

/**
 * The cheap checks first, on their own: a refused request costs a Map lookup,
 * not a session decode, a redirect-table lookup or a locale negotiation, and a
 * listing canonicalisation is answered without the session's cookies (a 301
 * that may be cached must not carry a Set-Cookie). The two product APIs are
 * matched only for the rate limit (and /api/ready); they are not localised
 * and carry their own auth.
 */
export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const limited = rateLimit(request);
  if (limited) return limited;
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const listing = listingCanonicalRedirect(request);
  if (listing) return listing;
  return authProxy(request, event as never);
}

/**
 * Two middlewares, one matcher.
 *
 * /admin is NOT localised (staff UI is Greek only) and is gated on a valid JWT.
 * Everything else goes through next-intl locale negotiation.
 */
const authProxy = auth(async (request) => {
  const response = await route(request);
  /*
   * Not on the final domain yet: every page says so in a header as well as in
   * robots.txt and the <meta> tag. The header is the one crawlers honour even
   * for a URL they reached from a link elsewhere, without reading robots.txt.
   * Read per request, so going live is a restart with SITE_INDEXING=on.
   */
  if (!indexingAllowed()) response.headers.set("X-Robots-Tag", NOINDEX_HEADER);
  /*
   * Live, the English and Italian pages are for visitors who switch language,
   * not for search (SEO is Greek only): followed, never indexed — said in the
   * header too, so a page that forgets its <meta> is still covered.
   */
  else if (/^\/(en|it)(\/|$)/.test(request.nextUrl.pathname)) response.headers.set("X-Robots-Tag", "noindex, follow");
  return response;
});

async function route(request: NextRequest & { auth: { user?: unknown } | null }): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Before the host fold, so an old URL on www. is one hop, not two. The
  // manual rules first: a person can always correct an automatic mapping.
  const manual = await manualRedirect(request);
  if (manual) return manual;

  const magento = await magentoRedirect(request);
  if (magento) return magento;

  const moved = movedRedirect(request);
  if (moved) return moved;

  const canonical = canonicalHostRedirect(request);
  if (canonical) return canonical;

  /*
   * An `.html` that is not an old Magento page is a real file in public/ — a
   * search-engine verification file. Served as is: no locale rewrite, no
   * locale cookie (the `.html` matcher is only there for the step above).
   */
  if (pathname.endsWith(".html")) return NextResponse.next();

  if (pathname.startsWith("/admin")) {
    const isLoginPage = pathname === "/admin/login";
    const isAuthed = !!request.auth?.user;
    // «Ξέχασα τον κωδικό» is for people who cannot sign in, so it is public.
    const isRecoveryPage = pathname === "/admin/forgot-password" || pathname === "/admin/reset-password";

    if (!isAuthed && !isLoginPage && !isRecoveryPage) {
      const url = new URL("/admin/login", request.nextUrl);
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    if (isAuthed && isLoginPage) {
      return NextResponse.redirect(new URL("/admin", request.nextUrl));
    }
    return NextResponse.next();
  }

  return intlMiddleware(request as NextRequest);
}

export const config = {
  matcher: [
    // Skip Next internals, the auth endpoints and anything with a file extension.
    "/((?!api|_next|_vercel|.*\\..*).*)",
    // …except the old Magento `*.html` pages, which get a 301 (see magentoRedirect).
    "/((?!api|_next|_vercel).*\\.html)",
    // The product listing APIs and the database check, for the rate limit only.
    "/api/suggest",
    "/api/acp/products",
    "/api/ready",
  ],
};
