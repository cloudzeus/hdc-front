/**
 * The ids that tie this site to Google accounts.
 *
 * ── No defaults, on purpose ────────────────────────────────────────────────
 *
 * This shop was copied from the Kolleris eshop, where each of these fell back
 * to a Kolleris id written into the source (Search Console token, Merchant
 * Center 5834747829, Business Profile store code, G-EGS1JNM4EC, GTM-NXJCLBQT).
 * On milwaukeetoolshdc.gr that would verify, measure and report into another
 * shop's accounts, and nothing would ever say so. Here an id comes from the
 * environment or not at all, and a missing id means the tag, script or feed
 * is left out — never a build error, because some (GTM) are not issued yet.
 *
 * ── Read at runtime, on the server ─────────────────────────────────────────
 *
 * The lookup is by computed key, so Next does not inline the `NEXT_PUBLIC_`
 * ones at build time: every consumer is a server component or route, and a
 * value set on the container is picked up on the next render. The Dockerfile
 * also passes them as build args, for pages prerendered during the build.
 *
 * The Kolleris-era names (GOOGLE_SITE_VERIFICATION, NEXT_PUBLIC_GOOGLE_MERCHANT_ID,
 * GOOGLE_LOCAL_STORE_CODE, NEXT_PUBLIC_GA_MEASUREMENT_ID) are deliberately NOT
 * read: an app cloned from the Kolleris one still carries them, with its ids.
 */

type Env = Record<string, string | undefined>;

const SPEC = {
  /** Search Console HTML-tag verification — also claims the site for Merchant Center. */
  gscVerification: { env: "NEXT_PUBLIC_GSC_VERIFICATION", shape: /^[\w-]{10,100}$/ },
  /** Merchant Center account, for the Customer Reviews opt-in. */
  merchantId: { env: "NEXT_PUBLIC_MERCHANT_ID", shape: /^\d{5,15}$/ },
  /** The store code exactly as the Business Profile has it. */
  localStoreCode: { env: "LOCAL_INVENTORY_STORE_CODE", shape: /^[\w.-]{1,64}$/ },
  /** GA4 measurement id. */
  gaId: { env: "NEXT_PUBLIC_GA_ID", shape: /^G-[A-Z0-9]{4,20}$/i },
  /** Tag Manager container. */
  gtmId: { env: "NEXT_PUBLIC_GTM_ID", shape: /^GTM-[A-Z0-9]{4,20}$/i },
} as const;

export type SiteIdName = keyof typeof SPEC;

/** The environment variable each id is read from — for docs and deploy checks. */
export const SITE_ID_ENV: Record<SiteIdName, string> = Object.fromEntries(
  Object.entries(SPEC).map(([name, spec]) => [name, spec.env]),
) as Record<SiteIdName, string>;

/**
 * The id, or `undefined` when it is unset, blank or not in the expected shape.
 *
 * Trimmed of whitespace and the trailing comma a deployment form leaves behind
 * (the same slip that once broke NEXT_PUBLIC_SITE_URL). A value in the wrong
 * shape is dropped rather than rendered into a script tag.
 */
export function siteId(name: SiteIdName, env: Env = process.env): string | undefined {
  const spec = SPEC[name];
  const raw = env[spec.env]?.trim().replace(/[\s,;]+$/, "");
  if (!raw) return undefined;
  return spec.shape.test(raw) ? raw : undefined;
}
