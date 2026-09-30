import { describe, expect, it } from "vitest";
import { alternatesFor, pageMeta } from "@/lib/seo/urls";
import { sitemapIndexXml, urlsetXml } from "@/lib/seo/sitemap-xml";

/**
 * SEO, GEO and AEO in Greek only (owner decision, 30/9/2026): the Greek
 * pages declare only themselves, with no hreflang to /en or /it; the en/it
 * pages stay for visitors who switch language, `noindex, follow`.
 */
describe("Greek-only indexing", () => {
  it("a Greek page has a self-canonical and no language alternates", () => {
    const alt = alternatesFor("/katalogos/drapana", "el");
    expect(alt.canonical).toMatch(/\/katalogos\/drapana$/);
    expect(alt.canonical).not.toMatch(/\/(en|it)\//);
    expect(alt).not.toHaveProperty("languages");
  });

  it("an en/it page is its own canonical, not for search", () => {
    const meta = pageMeta({ path: "/katalogos/drapana", locale: "en", title: "Drills", description: "…" });
    expect(String(meta.alternates.canonical)).toMatch(/\/en\/katalogos\/drapana$/);
    expect(meta.alternates).not.toHaveProperty("languages");
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("a Greek page says nothing about robots, leaving it to the site switch", () => {
    const meta = pageMeta({ path: "/katalogos/drapana", locale: "el", title: "Δράπανα", description: "…" });
    expect(meta.robots).toBeUndefined();
  });
});

describe("sitemap XML", () => {
  it("writes a urlset with image entries, escaped", () => {
    const xml = urlsetXml([
      {
        loc: "https://milwaukeetoolshdc.gr/proion/a?x=1&y=2",
        lastmod: new Date("2026-09-30T10:00:00Z"),
        images: ["https://cdn.example/a.webp"],
      },
    ]);
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(xml).toContain("<loc>https://milwaukeetoolshdc.gr/proion/a?x=1&amp;y=2</loc>");
    expect(xml).toContain("<lastmod>2026-09-30T10:00:00.000Z</lastmod>");
    expect(xml).toContain("<image:image><image:loc>https://cdn.example/a.webp</image:loc></image:image>");
    expect(xml).not.toContain("hreflang");
  });

  it("writes a sitemap index", () => {
    const xml = sitemapIndexXml([{ loc: "https://milwaukeetoolshdc.gr/sitemaps/products.xml" }]);
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("<sitemap><loc>https://milwaukeetoolshdc.gr/sitemaps/products.xml</loc></sitemap>");
  });
});
