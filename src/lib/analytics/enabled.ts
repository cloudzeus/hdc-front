import { siteId } from "@/lib/seo/site-ids";

type Env = Record<string, string | undefined>;

/**
 * Whether Google tags load, and with them the consent default, the banner and
 * the footer's «Ρυθμίσεις cookies»: production builds with a GA4 id or a Tag
 * Manager container. Development never measures (developer traffic would land
 * in the shop's numbers), and with no tag there is nothing to consent to.
 */
export function analyticsEnabled(env: Env = process.env): boolean {
  if (env.NODE_ENV !== "production") return false;
  return Boolean(siteId("gaId", env) || siteId("gtmId", env));
}
