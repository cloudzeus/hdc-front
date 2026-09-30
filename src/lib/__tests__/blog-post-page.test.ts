import { describe, expect, it } from "vitest";
import type { Article } from "@/lib/blog/articles";
import { articleJsonLd, articleMetadata, articlePath } from "@/lib/blog/post-page";

/**
 * An article is its own page: its own canonical — Greek only, no en/it
 * alternates (owner decision: SEO is for the Greek market only) — not the
 * site root's, with the SEO title and description the editor wrote, and
 * structured data that says what the page shows and no more.
 */
const article: Article = {
  kind: "ARTICLE",
  slug: "m18-fuel-i-m18-odigos-epilogis",
  title: "M18 FUEL ή απλό M18; Οδηγός επιλογής για επαγγελματίες",
  seoTitle: "M18 FUEL ή M18; Οδηγός επιλογής Milwaukee 18V",
  metaDescription: "Τι αλλάζει ανάμεσα σε M18 FUEL και απλό M18.",
  shortDescription: "Τι αλλάζει ανάμεσα σε M18 FUEL και απλό M18.",
  answer: "Το M18 FUEL είναι η κορυφαία σειρά της πλατφόρμας M18.",
  html: "<p>…</p>",
  faq: [{ q: "Είναι οι μπαταρίες ίδιες;", a: "Ναι." }],
  keywords: ["M18 FUEL ή M18"],
  entities: ["Milwaukee", "M18 FUEL"],
  sources: ["https://www.milwaukeetool.eu/systems/m18/"],
  image: { url: "https://cdn.example/m18.jpg", mainImage: true, width: null, height: null },
  publishedAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-02T08:00:00.000Z",
  readingMinutes: 6,
  draft: false,
};

describe("articlePath", () => {
  it("puts articles under /blog and guides under /odigoi", () => {
    expect(articlePath(article)).toBe("/blog/m18-fuel-i-m18-odigos-epilogis");
    expect(articlePath({ kind: "GUIDE", slug: "pos-dialego-drapano" })).toBe("/odigoi/pos-dialego-drapano");
  });
});

describe("articleMetadata", () => {
  const meta = articleMetadata(article, "el");

  it("gives the article its own Greek canonical and no en/it alternates", () => {
    expect(String(meta.alternates?.canonical)).toMatch(/\/blog\/m18-fuel-i-m18-odigos-epilogis$/);
    expect(String(meta.alternates?.canonical)).not.toMatch(/\/(en|it)\//);
    expect(meta.alternates?.languages).toBeUndefined();
    expect(meta.robots).toBeUndefined();
  });

  it("keeps the Greek canonical on an en/it copy, which is not for search", () => {
    const en = articleMetadata(article, "en");
    expect(String(en.alternates?.canonical)).not.toMatch(/\/en\//);
    expect(en.robots).toEqual({ index: false, follow: true });
  });

  it("keeps a draft preview out of the index entirely", () => {
    expect(articleMetadata({ ...article, draft: true }, "el").robots).toEqual({ index: false, follow: false });
  });

  it("uses the SEO title on its own when the site name would not fit", () => {
    expect(meta.title).toEqual({ absolute: "M18 FUEL ή M18; Οδηγός επιλογής Milwaukee 18V" });
    expect(meta.description).toBe(article.metaDescription);
  });

  it("is an article with its date and image", () => {
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.type).toBe("article");
    expect(og.publishedTime).toBe(article.publishedAt);
    expect(JSON.stringify(og.images)).toContain(article.image!.url);
  });
});

describe("articleJsonLd", () => {
  const ld = articleJsonLd(article);
  const [posting, faq] = ld["@graph"] as Array<Record<string, unknown>>;

  it("is a Greek BlogPosting by the store, with its answer, entities and sources", () => {
    expect(posting["@type"]).toBe("BlogPosting");
    expect(posting.inLanguage).toBe("el-GR");
    expect(posting.headline).toBe(article.title);
    expect(posting.abstract).toBe(article.answer);
    expect(posting.datePublished).toBe(article.publishedAt);
    expect(posting.citation).toEqual(article.sources);
    expect(posting.about).toEqual([
      { "@type": "Thing", name: "Milwaukee" },
      { "@type": "Thing", name: "M18 FUEL" },
    ]);
    expect(JSON.stringify(posting.publisher)).toContain("/#shop");
  });

  it("carries the page's FAQ as FAQPage", () => {
    expect(faq["@type"]).toBe("FAQPage");
    expect(JSON.stringify(faq.mainEntity)).toContain("Είναι οι μπαταρίες ίδιες;");
  });

  it("calls a guide an Article, and leaves FAQPage out when there is no FAQ", () => {
    const guide = articleJsonLd({ ...article, kind: "GUIDE", faq: [] });
    expect(guide["@graph"]).toHaveLength(1);
    expect((guide["@graph"][0] as Record<string, unknown>)["@type"]).toBe("Article");
  });
});
