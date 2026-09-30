/**
 * Whether `host` is another name for the canonical host — its apex or its
 * `www.` — and so should be folded into it with a 301.
 *
 * Derived from the canonical host, never from a list: the rule copied from the
 * Kolleris eshop matched `*.kolleris.com`, which on this container would have
 * claimed the other shop's domains. Anything else (an IP health check, a
 * Coolify preview domain, a staging subdomain) is left alone — a redirect loop is worse than a
 * duplicate. Edge-safe: no imports.
 */
export function isAliasHost(host: string, canonicalHost: string): boolean {
  const name = host.split(":")[0].toLowerCase();
  const canonical = canonicalHost.split(":")[0].toLowerCase();
  if (!name || !canonical || name === canonical) return false;
  const apex = canonical.replace(/^www\./, "");
  return name === apex || name === `www.${apex}`;
}
