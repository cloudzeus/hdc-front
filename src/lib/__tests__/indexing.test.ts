import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_CRAWLERS, indexingAllowed } from "@/lib/seo/indexing";
import robots from "@/app/robots";
import { siteOrigin } from "@/lib/seo/urls";
import { facetRules } from "@/lib/seo/robots-rules";

/**
 * The one switch between "staging copy nobody may index" and "the shop".
 *
 * The shape that matters is the default: a deployment with no SITE_INDEXING
 * at all must come out blocked, because that is what a new server looks like.
 */
describe("indexingAllowed", () => {
  it("is off when the variable is absent", () => {
    expect(indexingAllowed({})).toBe(false);
  });

  it("is off for anything but 'on'", () => {
    for (const value of ["", "off", "true", "1", "yes", "no", "false"]) {
      expect(indexingAllowed({ SITE_INDEXING: value })).toBe(false);
    }
  });

  it("is on for 'on', forgiving case and stray whitespace", () => {
    expect(indexingAllowed({ SITE_INDEXING: "on" })).toBe(true);
    expect(indexingAllowed({ SITE_INDEXING: " ON \n" })).toBe(true);
  });

  it("reads process.env by default", () => {
    vi.stubEnv("SITE_INDEXING", "on");
    expect(indexingAllowed()).toBe(true);
    vi.stubEnv("SITE_INDEXING", "");
    expect(indexingAllowed()).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("robots()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks everything, and advertises nothing, while indexing is off", () => {
    vi.stubEnv("SITE_INDEXING", "");
    const out = robots();
    const rules = Array.isArray(out.rules) ? out.rules : [out.rules];

    expect(rules[0]).toEqual({ userAgent: "*", disallow: "/" });
    // Every named AI crawler gets its own Disallow: / group.
    for (const bot of AI_CRAWLERS) {
      expect(rules).toContainEqual({ userAgent: bot, disallow: "/" });
    }
    expect(rules).toHaveLength(1 + AI_CRAWLERS.length);
    // Nothing is allowed anywhere.
    expect(rules.some((r) => "allow" in r)).toBe(false);
    // The sitemap and the host stay unadvertised.
    expect(out.sitemap).toBeUndefined();
    expect(out.host).toBeUndefined();
  });

  it("names the AI crawlers the go-live checklist expects", () => {
    expect([...AI_CRAWLERS]).toEqual(
      expect.arrayContaining([
        "GPTBot",
        "ChatGPT-User",
        "OAI-SearchBot",
        "ClaudeBot",
        "Claude-Web",
        "anthropic-ai",
        "PerplexityBot",
        "Perplexity-User",
        "Google-Extended",
        "CCBot",
        "Bytespider",
        "Applebot-Extended",
        "Amazonbot",
        "meta-externalagent",
      ]),
    );
  });

  it("keeps the storefront rules, plus the facet rules, once indexing is on", () => {
    vi.stubEnv("SITE_INDEXING", "on");
    const facets = facetRules();
    expect(robots()).toEqual({
      rules: [
        {
          userAgent: "*",
          allow: ["/", ...facets.allow],
          disallow: [
            "/admin",
            "/api",
            "/kalathi",
            "/checkout",
            "/logariasmos",
            "/eisodos",
            "/eggrafi",
            ...facets.disallow,
          ],
        },
      ],
      // The origin is resolved once at module load; whatever it is, both lines use it.
      sitemap: `${siteOrigin()}/sitemap.xml`,
      host: siteOrigin(),
    });
  });
});
