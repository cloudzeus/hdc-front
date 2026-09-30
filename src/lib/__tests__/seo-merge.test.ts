import { describe, expect, it } from "vitest";
import { mergeSeo } from "@/lib/seo/seo-merge";

const auto = {
  h1: "Δράπανα",
  title: "Δράπανα Milwaukee",
  description: "Αυτόματη περιγραφή.",
  intro: "Αυτόματη εισαγωγή.",
  faq: [{ q: "Αυτόματη;", a: "Ναι." }],
};

describe("mergeSeo", () => {
  it("is the automatic text when there is no override", () => {
    const seo = mergeSeo(auto, null);
    expect(seo).toMatchObject({ h1: "Δράπανα", title: "Δράπανα Milwaukee", intro: "Αυτόματη εισαγωγή.", body: null });
    expect(seo.faq).toEqual(auto.faq);
    expect(seo.overridden).toEqual([]);
  });

  it("takes each filled field of the override and keeps the automatic text for the rest", () => {
    const seo = mergeSeo(auto, { h1: "Δράπανα μπαταρίας Milwaukee", seoTitle: "  ", metaDescription: null, body: "## Οδηγός" });
    expect(seo.h1).toBe("Δράπανα μπαταρίας Milwaukee");
    expect(seo.title).toBe("Δράπανα Milwaukee");
    expect(seo.description).toBe("Αυτόματη περιγραφή.");
    expect(seo.body).toBe("## Οδηγός");
    expect(seo.overridden).toEqual(["h1", "body"]);
  });

  it("replaces the FAQ only with a non-empty, well-formed one", () => {
    expect(mergeSeo(auto, { faq: [] }).faq).toEqual(auto.faq);
    expect(mergeSeo(auto, { faq: [{ q: "Χωρίς απάντηση" }] }).faq).toEqual(auto.faq);
    expect(mergeSeo(auto, { faq: [{ q: "Δική μας;", a: "Ναι." }] }).faq).toEqual([{ q: "Δική μας;", a: "Ναι." }]);
  });

  it("passes the related links through, cleaned", () => {
    const seo = mergeSeo(auto, { relatedArticles: ["a", "", 3, " b "], relatedCategories: "x" });
    expect(seo.relatedArticles).toEqual(["a", "b"]);
    expect(seo.relatedCategories).toEqual([]);
  });
});
