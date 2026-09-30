import { describe, expect, it } from "vitest";
import { isAliasHost } from "@/lib/seo/canonical-host";

/**
 * Which hosts the proxy folds into the canonical one with a 301.
 *
 * Copied from the Kolleris eshop, the rule matched `*.kolleris.com` — on the
 * HDC container that would have sent Kolleris' own domains to this shop. It is
 * now derived from the canonical host itself: its apex and its www.
 */
describe("isAliasHost", () => {
  const canonical = "milwaukeetoolshdc.gr";

  it("folds www into the apex", () => {
    expect(isAliasHost("www.milwaukeetoolshdc.gr", canonical)).toBe(true);
    expect(isAliasHost("WWW.milwaukeetoolshdc.gr:443", canonical)).toBe(true);
  });

  it("leaves the canonical host alone", () => {
    expect(isAliasHost("milwaukeetoolshdc.gr", canonical)).toBe(false);
  });

  it("folds the apex into a www canonical", () => {
    expect(isAliasHost("milwaukeetoolshdc.gr", "www.milwaukeetoolshdc.gr")).toBe(true);
  });

  it("never claims another shop's domain", () => {
    expect(isAliasHost("web.kolleris.com", canonical)).toBe(false);
    expect(isAliasHost("kolleris.com", canonical)).toBe(false);
    expect(isAliasHost("evilmilwaukeetoolshdc.gr", canonical)).toBe(false);
  });

  it("ignores hosts it cannot vouch for", () => {
    // Health checks on an IP, a Coolify preview domain.
    expect(isAliasHost("127.0.0.1:3000", canonical)).toBe(false);
    expect(isAliasHost("abc.sslip.io", canonical)).toBe(false);
    // A staging subdomain is its own site, not an alias.
    expect(isAliasHost("staging.milwaukeetoolshdc.gr", canonical)).toBe(false);
    expect(isAliasHost("", canonical)).toBe(false);
  });
});
