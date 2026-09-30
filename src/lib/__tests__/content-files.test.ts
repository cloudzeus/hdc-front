import { describe, expect, it } from "vitest";
import {
  parseArticleFile,
  parseCategoryFile,
  parsePlatformFile,
  splitFrontMatter,
  splitLead,
  stripFaqSection,
} from "@/lib/seo/content-files";

const ARTICLE = `---
title: "M18 FUEL ή απλό M18; Οδηγός επιλογής"
seoTitle: "M18 FUEL ή M18; Οδηγός επιλογής Milwaukee 18V"
metaDescription: "Τι αλλάζει ανάμεσα σε M18 FUEL και απλό M18."
slug: "m18-fuel-i-m18-odigos-epilogis"
lang: el
status: draft
date: "2026-09-30"
keywords:
  - "M18 FUEL ή M18"
  - "Milwaukee M18 FUEL"
entities:
  - "Milwaukee"
  - "M18"
about:
  - "Δράπανο"
sources:
  - "https://www.milwaukeetool.eu/systems/m18/"
faq:
  - q: "Είναι οι μπαταρίες ίδιες;"
    a: "Ναι, κάθε μπαταρία M18 ταιριάζει σε κάθε εργαλείο M18."
  - q: "Αξίζει το FUEL;"
    a: "Για καθημερινή βαριά χρήση, συνήθως ναι."
---

**Σύντομη απάντηση:** Το M18 FUEL είναι η κορυφαία σειρά
της πλατφόρμας M18.

Όποιος μπαίνει στο σύστημα 18 V βλέπει δύο ονόματα.

## Τι είναι το M18;

Η οικογένεια 18 V.

## Συχνές ερωτήσεις

### Είναι οι μπαταρίες ίδιες;

Ναι, κάθε μπαταρία M18 ταιριάζει σε κάθε εργαλείο M18.

### Αξίζει το FUEL;

Για καθημερινή βαριά χρήση, συνήθως ναι.
`;

describe("splitFrontMatter", () => {
  it("separates YAML front matter from the Markdown body", () => {
    const { data, body } = splitFrontMatter(ARTICLE);
    expect(data.slug).toBe("m18-fuel-i-m18-odigos-epilogis");
    expect(body.startsWith("**Σύντομη απάντηση:**")).toBe(true);
  });

  it("treats a file without front matter as all body", () => {
    expect(splitFrontMatter("# Title\n\nText")).toEqual({ data: {}, body: "# Title\n\nText" });
  });
});

describe("splitLead", () => {
  it("takes the first paragraph as the answer, without its label, and joins its lines", () => {
    const { lead, rest } = splitLead("**Σύντομη απάντηση:** Πρώτη\nγραμμή.\n\nΔεύτερη παράγραφος.\n");
    expect(lead).toBe("Πρώτη γραμμή.");
    expect(rest).toBe("Δεύτερη παράγραφος.");
  });

  it("does not take a heading, a list or a table as the lead", () => {
    expect(splitLead("## Ερώτηση\n\nΚείμενο").lead).toBeNull();
    expect(splitLead("- ένα\n- δύο").lead).toBeNull();
    expect(splitLead("| a | b |\n|---|---|").lead).toBeNull();
  });
});

describe("stripFaqSection", () => {
  it("lifts the «Συχνές ερωτήσεις» section out of the body as pairs", () => {
    const { body, faq } = stripFaqSection(
      "Κείμενο.\n\n## Συχνές ερωτήσεις\n\n### Α;\n\nΑπάντηση α.\n\n### Β;\n\nΑπάντηση\nβ.\n\n## Μετά\n\nΤέλος.",
    );
    expect(faq).toEqual([
      { q: "Α;", a: "Απάντηση α." },
      { q: "Β;", a: "Απάντηση β." },
    ]);
    expect(body).toBe("Κείμενο.\n\n## Μετά\n\nΤέλος.");
  });

  it("leaves a body without FAQ alone", () => {
    expect(stripFaqSection("Κείμενο.")).toEqual({ body: "Κείμενο.", faq: [] });
  });
});

describe("parseArticleFile", () => {
  const article = parseArticleFile(ARTICLE, "ARTICLE")!;

  it("reads the fields the ContentArticle needs", () => {
    expect(article.slug).toBe("m18-fuel-i-m18-odigos-epilogis");
    expect(article.kind).toBe("ARTICLE");
    expect(article.title).toBe("M18 FUEL ή απλό M18; Οδηγός επιλογής");
    expect(article.seoTitle).toBe("M18 FUEL ή M18; Οδηγός επιλογής Milwaukee 18V");
    expect(article.metaDescription).toBe("Τι αλλάζει ανάμεσα σε M18 FUEL και απλό M18.");
    expect(article.keywords).toEqual(["M18 FUEL ή M18", "Milwaukee M18 FUEL"]);
    expect(article.entities).toEqual(["Milwaukee", "M18", "Δράπανο"]);
    expect(article.sources).toEqual(["https://www.milwaukeetool.eu/systems/m18/"]);
  });

  it("splits the answer off the body and keeps the FAQ in its own field only", () => {
    expect(article.answer).toBe("Το M18 FUEL είναι η κορυφαία σειρά της πλατφόρμας M18.");
    expect(article.body.startsWith("Όποιος μπαίνει")).toBe(true);
    expect(article.body).not.toContain("Συχνές ερωτήσεις");
    expect(article.faq).toHaveLength(2);
    expect(article.faq[0]).toEqual({ q: "Είναι οι μπαταρίες ίδιες;", a: "Ναι, κάθε μπαταρία M18 ταιριάζει σε κάθε εργαλείο M18." });
  });

  it("falls back to the body's FAQ when the front matter has none", () => {
    const noFaq = ARTICLE.replace(/faq:\n(?:  .*\n)+/, "");
    expect(parseArticleFile(noFaq, "GUIDE")!.faq.map((p) => p.q)).toEqual(["Είναι οι μπαταρίες ίδιες;", "Αξίζει το FUEL;"]);
  });

  it("refuses a file that is not Greek or has no slug or title", () => {
    expect(parseArticleFile(ARTICLE.replace("lang: el", "lang: en"), "ARTICLE")).toBeNull();
    expect(parseArticleFile(ARTICLE.replace(/slug: .*\n/, ""), "ARTICLE")).toBeNull();
    expect(parseArticleFile("no front matter", "ARTICLE")).toBeNull();
  });
});

describe("parsePlatformFile", () => {
  const HUB = `---
key: "m18"
route: "/milwaukee-m18"
lang: el
h1: "Milwaukee M18: εργαλεία μπαταρίας 18V"
seoTitle: "Milwaukee M18 & M18 FUEL"
metaDescription: "Τι είναι η πλατφόρμα M18."
keywords: ["M18"]
entities: ["M18"]
sources: ["https://www.milwaukeetool.eu/systems/m18/"]
faq:
  - q: "Πόσα εργαλεία;"
    a: "Πάνω από 325."
relatedArticles:
  - "m12-i-m18-poia-platforma"
---

Η πλατφόρμα M18 είναι η οικογένεια 18 V.

## Τι είναι;

Κείμενο.

## Συχνές ερωτήσεις

### Πόσα εργαλεία;

Πάνω από 325.
`;

  it("maps a hub to a PLATFORM override with intro, body and FAQ", () => {
    const hub = parsePlatformFile(HUB)!;
    expect(hub.targetKey).toBe("m18");
    expect(hub.h1).toBe("Milwaukee M18: εργαλεία μπαταρίας 18V");
    expect(hub.intro).toBe("Η πλατφόρμα M18 είναι η οικογένεια 18 V.");
    expect(hub.body).toBe("## Τι είναι;\n\nΚείμενο.");
    expect(hub.faq).toEqual([{ q: "Πόσα εργαλεία;", a: "Πάνω από 325." }]);
    expect(hub.relatedArticles).toEqual(["m12-i-m18-poia-platforma"]);
  });
});

describe("parseCategoryFile", () => {
  it("maps the Greek block of a category file to a CATEGORY override", () => {
    const cat = parseCategoryFile(
      JSON.stringify({
        slug: "gantia",
        el: {
          h1: "Γάντια εργασίας Milwaukee",
          seoTitle: "Γάντια Milwaukee",
          metaDescription: "Γάντια κατά της κοπής.",
          intro: "Τα γάντια χωρίζονται ανά κίνδυνο.",
          keywords: ["γάντια"],
          faq: [{ q: "Τι σημαίνει Cut A;", a: "Αντοχή στην κοπή." }],
          relatedCategories: ["prostasia-ano-akron"],
        },
        sources: ["https://www.milwaukeetool.eu/"],
      }),
    )!;
    expect(cat.targetKey).toBe("gantia");
    expect(cat.h1).toBe("Γάντια εργασίας Milwaukee");
    expect(cat.intro).toBe("Τα γάντια χωρίζονται ανά κίνδυνο.");
    expect(cat.faq).toEqual([{ q: "Τι σημαίνει Cut A;", a: "Αντοχή στην κοπή." }]);
    expect(cat.relatedCategories).toEqual(["prostasia-ano-akron"]);
    expect(cat.sources).toEqual(["https://www.milwaukeetool.eu/"]);
    expect(cat.body).toBeNull();
  });

  it("refuses a file without a slug or Greek block", () => {
    expect(parseCategoryFile(JSON.stringify({ slug: "x" }))).toBeNull();
    expect(parseCategoryFile("not json")).toBeNull();
  });
});
