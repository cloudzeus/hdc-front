import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";

/**
 * Google's robots.txt semantics, small enough to trust: `*` is any run of
 * characters, `$` anchors the end, the longest matching rule wins and a tie
 * goes to Allow.
 */
function allowed(rules: { allow: string[]; disallow: string[] }, url: string): boolean {
  const matches = (pattern: string) => {
    const anchored = pattern.endsWith("$");
    const body = (anchored ? pattern.slice(0, -1) : pattern)
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${body}${anchored ? "$" : ""}`).test(url);
  };
  const best = (patterns: string[]) => Math.max(-1, ...patterns.filter(matches).map((p) => p.length));
  const a = best(rules.allow);
  const d = best(rules.disallow);
  return d === -1 || a >= d;
}

function rulesOf() {
  const rule = [robots().rules].flat()[0];
  const list = (v: string | string[] | undefined) => (v == null ? [] : [v].flat());
  return { allow: list(rule.allow), disallow: list(rule.disallow) };
}

describe("robots.txt once live", () => {
  beforeEach(() => vi.stubEnv("SITE_INDEXING", "on"));
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    "/",
    "/katalogos",
    "/katalogos/drapana",
    "/katalogos/drapana?page=3",
    "/en/katalogos/drapana?page=2",
    "/it/brands/dewalt",
    "/brands/dewalt?page=4",
    "/proionta?page=2",
    "/prosfores/summer",
    "/proion/some-product",
    "/milwaukee-m18",
    // Platform landings, as crawlable as before the facet rules.
    "/katalogos/drapana?platform=M18",
    "/katalogos/drapana?platform=M18&page=2",
    "/katalogos/drapana?page=2&platform=M18",
    "/en/katalogos/drapana?platform=M12",
    "/it/katalogos/drapana?platform=MX&page=3",
  ])("lets crawlers fetch %s", (url) => {
    expect(allowed(rulesOf(), url)).toBe(true);
  });

  it.each([
    "/katalogos/drapana?sub=a",
    "/en/katalogos/drapana?series=fuel&content=bare&min=100",
    "/katalogos/drapana?page=2&avail=in-stock",
    "/katalogos/drapana?avail=in-stock&page=2",
    "/it/brands/dewalt?avail=in-stock",
    "/proionta?sort=price-asc",
    "/en/prosfores/summer?brand=x",
    "/katalogos/drapana?platform=M18&series=fuel",
    "/katalogos/drapana?series=fuel&platform=M18",
    "/katalogos/drapana?platform=M18&page=2&sub=x",
    "/katalogos/drapana?platform=M18&sub=x&page=2",
    "/katalogos/drapana?page=2&platform=M18&sub=x",
    "/katalogos/drapana?page=2&sub=x&platform=M18",
    "/katalogos/drapana?platform=M18&utm_source=x",
    "/brands/dewalt?platform=M18",
    "/kalathi",
    "/en/kalathi",
    "/it/kalathi",
    "/checkout/epibebaiosi/123?token=x",
    "/en/checkout/epibebaiosi/123?token=x",
    "/it/logariasmos/paraggelies",
    "/en/logariasmos",
    "/en/eisodos",
    "/it/eggrafi",
    "/admin",
    "/api/suggest?q=x",
  ])("keeps crawlers off %s", (url) => {
    expect(allowed(rulesOf(), url)).toBe(false);
  });

  it("writes no character Next would escape in robots.txt", () => {
    // `&` comes out as `&amp;`, and a rule with it then matches nothing.
    const { allow, disallow } = rulesOf();
    for (const rule of [...allow, ...disallow]) expect(rule, rule).not.toMatch(/[&<>"']/);
  });

  it("still lists the sitemap", () => {
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });
});

describe("robots.txt before go-live", () => {
  it("still closes everything", () => {
    vi.stubEnv("SITE_INDEXING", "");
    try {
      const rules = [robots().rules].flat();
      expect(rules[0]).toEqual({ userAgent: "*", disallow: "/" });
      expect(robots().sitemap).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
