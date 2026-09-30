import { describe, expect, it } from "vitest";
import { contentChecks, internalLinks, jsonLdBlocks } from "@/lib/seo/seo-checks";

const fields = (checks: ReturnType<typeof contentChecks>) => checks.map((c) => `${c.level}:${c.field}`);

describe("contentChecks", () => {
  const good = {
    title: "M18 FUEL ή απλό M18;",
    seoTitle: "M18 FUEL ή M18; Οδηγός επιλογής Milwaukee 18V",
    metaDescription: "Τι αλλάζει ανάμεσα σε M18 FUEL και απλό M18.",
    answer: "λέξη ".repeat(50),
    body: "Κείμενο.",
  };

  it("passes good copy", () => {
    expect(contentChecks(good, { answerRequired: true })).toEqual([]);
  });

  it("flags lengths: title, description, answer", () => {
    const checks = contentChecks({ ...good, seoTitle: "x".repeat(61), metaDescription: "y".repeat(156), answer: "λέξη ".repeat(20) });
    expect(fields(checks)).toEqual(["warn:seoTitle", "warn:metaDescription", "warn:answer"]);
  });

  it("refuses a dealer claim and warns on prices and stock", () => {
    expect(fields(contentChecks({ ...good, body: "Επίσημος αντιπρόσωπος της Milwaukee." }))).toContain("error:body");
    expect(contentChecks({ ...good, body: "Μόνο 199,90 € σήμερα." }).map((c) => c.message).join()).toMatch(/τιμή/);
    expect(contentChecks({ ...good, body: "Σε απόθεμα στον Πειραιά." }).map((c) => c.message).join()).toMatch(/απόθεμα/);
  });

  it("asks for an answer only where one is expected", () => {
    expect(fields(contentChecks({ ...good, answer: "" }, { answerRequired: true }))).toEqual(["warn:answer"]);
    expect(contentChecks({ ...good, answer: "" })).toEqual([]);
  });
});

describe("internalLinks", () => {
  it("lists each internal path once, without query or anchor", () => {
    expect(
      internalLinks("[α](/katalogos/drapana) [β](/proion/x?y=1) [γ](https://milwaukeetool.eu/) [δ](/katalogos/drapana/) [ε](#faq)"),
    ).toEqual(["/katalogos/drapana", "/proion/x"]);
  });
});

describe("jsonLdBlocks", () => {
  it("reads each block's types and what it lacks", () => {
    const html =
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"x","offers":{"price":"1.00"}}</script>' +
      '<script type="application/ld+json">{"@graph":[{"@type":"BlogPosting","headline":"h"},{"@type":"FAQPage","mainEntity":[{}]}]}</script>' +
      '<script type="application/ld+json">{oops</script>';
    const blocks = jsonLdBlocks(html);
    expect(blocks.map((b) => b.types)).toEqual([["Product"], ["BlogPosting", "FAQPage"], []]);
    expect(blocks[0].issues).toEqual(["Product: λείπει το image", "Product: λείπει το offers.priceCurrency", "Product: λείπει το offers.availability"]);
    expect(blocks[1].issues).toEqual(["BlogPosting: λείπει το datePublished", "BlogPosting: λείπει το image"]);
    expect(blocks[2].issues[0]).toMatch(/Μη έγκυρο JSON/);
  });
});
