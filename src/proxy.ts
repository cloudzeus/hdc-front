import NextAuth from "next-auth";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { routing } from "@/i18n/routing";
import { indexingAllowed, NOINDEX_HEADER } from "@/lib/seo/indexing";
import { isAliasHost } from "@/lib/seo/canonical-host";
import {
  createMagentoResolver,
  isMagentoCandidate,
  type MagentoTable,
} from "@/lib/seo/magento-redirects";

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

  const url = new URL(hit.to, request.nextUrl);
  const host = request.headers.get("host");
  if (CANONICAL_HOST && host && isAliasHost(host, CANONICAL_HOST)) {
    url.host = CANONICAL_HOST;
    url.protocol = "https:";
    url.port = "";
  }
  for (const [key, value] of searchParams) {
    if (hit.kind === "search" && MAGENTO_SEARCH_PARAMS.has(key)) continue;
    if (!url.searchParams.has(key)) url.searchParams.append(key, value);
  }
  return NextResponse.redirect(url, hit.kind === "search" ? 302 : 301);
}

/**
 * Two middlewares, one matcher.
 *
 * /admin is NOT localised (staff UI is Greek only) and is gated on a valid JWT.
 * Everything else goes through next-intl locale negotiation.
 */
export default auth(async (request) => {
  const response = await route(request);
  /*
   * Not on the final domain yet: every page says so in a header as well as in
   * robots.txt and the <meta> tag. The header is the one crawlers honour even
   * for a URL they reached from a link elsewhere, without reading robots.txt.
   * Read per request, so going live is a restart with SITE_INDEXING=on.
   */
  if (!indexingAllowed()) response.headers.set("X-Robots-Tag", NOINDEX_HEADER);
  return response;
});

async function route(request: NextRequest & { auth: { user?: unknown } | null }): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Before the host fold, so an old URL on www. is one hop, not two.
  const magento = await magentoRedirect(request);
  if (magento) return magento;

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
  ],
};
