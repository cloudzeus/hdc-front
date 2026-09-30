import { describe, expect, it } from "vitest";
import {
  codesGate,
  failedGates,
  forbiddenGate,
  greekShare,
  imageGate,
  languageGate,
  lengthsGate,
  linksGate,
  numbersGate,
  runGates,
  uniqueGate,
  verifierGate,
  type Catalogue,
  type Draft,
} from "@/lib/content-auto/gates";
import { supportedNumbers } from "@/lib/content-auto/text";

const para =
  "Το κρουστικό δραπανοκατσάβιδο είναι το εργαλείο που πιάνει πρώτο ο τεχνίτης για βίδωμα και τρύπημα σε ξύλο, μέταλλο και τούβλο, " +
  "γι' αυτό αξίζει να ξέρετε τι σημαίνει κάθε χαρακτηριστικό πριν το διαλέξετε για τη δουλειά σας στο εργοτάξιο ή στο συνεργείο.";

/** A draft that passes every gate: 4 H2, > 700 words, 50-word answer, 4 FAQ. */
function goodDraft(): Draft {
  const section = (h: string) => `## ${h}\n\n${Array.from({ length: 6 }, () => para).join("\n\n")}`;
  return {
    title: "Milwaukee M18 FPD3: εκδόσεις και για ποιον είναι",
    seoTitle: "Milwaukee M18 FPD3: εκδόσεις και σύγκριση",
    metaDescription: "Το M18 FPD3 σε σκέτο εργαλείο και κιτ: ροπή 158 Nm, δύο ταχύτητες, τι αλλάζει ανάμεσα στις εκδόσεις.",
    answer: Array.from({ length: 50 }, (_, i) => (i === 0 ? "Το" : "λέξη")).join(" "),
    body: [
      section("Τι είναι το M18 FPD3;"),
      "Δίνει 158 Nm και 0–2100 rpm. Δείτε το [M18 FPD3-502X](/proion/fpd3-kit).",
      section("Ποιες εκδόσεις υπάρχουν;"),
      section("Κιτ ή σκέτο εργαλείο;"),
      section("Για ποιον είναι;"),
    ].join("\n\n"),
    faq: [
      { q: "Πόση ροπή έχει;", a: "158 Nm κατά τη Milwaukee." },
      { q: "Έχει κρούση;", a: "Ναι, για τούβλο και τσιμεντόλιθο." },
      { q: "Ποιες μπαταρίες παίρνει;", a: "Όλες τις μπαταρίες M18." },
      { q: "Τι περιέχει το κιτ;", a: "Δύο μπαταρίες 5,0 Ah, φορτιστή και βαλίτσα." },
    ],
    keywords: ["m18 fpd3", "κρουστικό δραπανοκατσάβιδο milwaukee"],
    entities: ["Milwaukee", "M18 FUEL", "M18 FPD3"],
  };
}

const catalogue: Catalogue = {
  codes: new Set(["4933479859", "4933479860"]),
  roots: new Set(["M18 FPD3", "M18 B5"]),
  fullCodes: new Set(["M18 FPD3-0X", "M18 FPD3-502X"]),
};

const supported = supportedNumbers(
  ["Κιτ με δύο μπαταρίες M18 B5 5,0 Ah"],
  [
    { label: "Μέγιστη ροπή (Nm)", value: "158" },
    { label: "Ταχύτητα χωρίς φορτίο 2 (rpm)", value: "0 – 2100" },
  ],
);

describe("gate 1 · numbers", () => {
  it("passes when every number with a unit is in the pack", () => {
    expect(numbersGate(goodDraft(), supported).ok).toBe(true);
  });
  it("fails on a number the pack does not state", () => {
    const d = { ...goodDraft(), answer: "Δίνει 135 Nm." };
    const r = numbersGate(d, supported);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain("135 Nm");
  });
});

describe("gate 2 · codes and models", () => {
  it("passes on codes and models of the catalogue", () => {
    const d = { ...goodDraft(), faq: [...goodDraft().faq, { q: "Κωδικός;", a: "4933479859, M18 FPD3-0X, με M18 B5." }] };
    expect(codesGate(d, catalogue).ok).toBe(true);
  });
  it("fails on an unknown code or model", () => {
    const d = { ...goodDraft(), answer: "Το M18 FPD2-502X και ο κωδικός 4933000000." };
    const r = codesGate(d, catalogue);
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/4933000000/);
    expect(r.problems.join(" ")).toMatch(/M18 FPD2-502X/);
  });
});

describe("gate 3 · forbidden", () => {
  it("passes a clean text, the battery's fuel gauge included", () => {
    const d = { ...goodDraft(), answer: "Ο μετρητής αποθέματος δείχνει τη φόρτιση της μπαταρίας." };
    expect(forbiddenGate(d).ok).toBe(true);
  });
  it.each([
    ["τιμή", "Κοστίζει 199 € μόνο."],
    ["ευρώ", "Με 250 ευρώ το παίρνετε."],
    ["απόθεμα", "Υπάρχει σε απόθεμα στο κατάστημα."],
    ["τεμάχια", "Έχουμε 12 τεμάχια."],
    ["αντιπρόσωπος", "Είμαστε επίσημος αντιπρόσωπος."],
    ["εξουσιοδοτημένος", "Εξουσιοδοτημένος μεταπωλητής."],
    ["χονδρική", "Τιμές χονδρικής για εταιρικούς πελάτες."],
    ["B2B", "Πωλήσεις B2B."],
    ["άλλη μάρκα", "Πιο δυνατό από το Makita."],
  ])("fails on %s", (_label, text) => {
    expect(forbiddenGate({ ...goodDraft(), answer: text }).ok).toBe(false);
  });
});

describe("gate 4 · links", () => {
  it("passes internal links that exist", () => {
    expect(linksGate(goodDraft(), []).ok).toBe(true);
  });
  it("fails on an external link", () => {
    const d = { ...goodDraft(), body: `${goodDraft().body}\n\nΔείτε [εδώ](https://www.milwaukeetool.eu/x).` };
    expect(linksGate(d, []).ok).toBe(false);
  });
  it("fails on an internal link that leads nowhere", () => {
    const r = linksGate(goodDraft(), ["/proion/fpd3-kit"]);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain("/proion/fpd3-kit");
  });
});

describe("gate 5 · lengths", () => {
  it("passes the good draft", () => {
    expect(lengthsGate(goodDraft()).problems).toEqual([]);
  });
  it("fails a long title, a long meta, a short answer, a short body and too few FAQ", () => {
    const d = {
      ...goodDraft(),
      seoTitle: "x".repeat(61),
      metaDescription: "y".repeat(156),
      answer: "Πολύ λίγες λέξεις.",
      body: "## Ένα\n\nΛίγο κείμενο.",
      faq: goodDraft().faq.slice(0, 3),
    };
    const r = lengthsGate(d);
    expect(r.ok).toBe(false);
    expect(r.problems).toHaveLength(6);
  });
});

describe("gate 6 · language", () => {
  it("counts codes and names out", () => {
    expect(greekShare("Το Milwaukee M18 FPD3-502X με FUEL και REDLINK PLUS είναι δυνατό.")).toBe(1);
    expect(languageGate(goodDraft()).ok).toBe(true);
  });
  it("fails a text in English", () => {
    const d = { ...goodDraft(), body: "This drill is a very good choice for most jobs on site and in the workshop. ".repeat(40) };
    expect(languageGate(d).ok).toBe(false);
  });
});

describe("gate 7 · uniqueness", () => {
  const existing = [
    { slug: "pos-dialego-drapano", title: "Πώς διαλέγω δράπανο", mainKeyword: "δράπανο" },
    { slug: "m18-fhiw2f12-sygkrisi", title: "M18 FHIW2F12 ή M18 ONEFHIWF12; Σύγκριση", mainKeyword: "M18 FHIW2F12" },
  ];
  it("passes a new subject with a new slug", () => {
    expect(uniqueGate(goodDraft(), "milwaukee-m18-fpd3-ekdoseis", existing).ok).toBe(true);
  });
  it("fails a taken slug, a similar title or a similar main keyword", () => {
    expect(uniqueGate(goodDraft(), "pos-dialego-drapano", existing).ok).toBe(false);
    expect(uniqueGate({ ...goodDraft(), title: "Δράπανα: πώς διαλέγω" }, "x", existing).ok).toBe(false);
    expect(uniqueGate({ ...goodDraft(), keywords: ["δράπανα"] }, "x", existing).ok).toBe(false);
  });
});

describe("gate 8 · verifier", () => {
  it("passes with no unsupported claim", () => {
    expect(verifierGate([]).ok).toBe(true);
  });
  it("fails on one unsupported claim, or when the check did not run", () => {
    expect(verifierGate([{ claim: "Έχει 3 ταχύτητες", reason: "το πακέτο λέει 2" }]).ok).toBe(false);
    expect(verifierGate(null).ok).toBe(false);
  });
});

describe("gate 9 · image", () => {
  it("passes with a product photo and fails without one", () => {
    expect(imageGate("https://cdn.test/p.webp").ok).toBe(true);
    expect(imageGate(null).problems[0]).toMatch(/no image/);
  });
});

describe("runGates", () => {
  it("runs all nine and reports the failed ones", () => {
    const results = runGates({
      draft: goodDraft(),
      slug: "milwaukee-m18-fpd3-ekdoseis",
      supported,
      catalogue,
      broken: [],
      existing: [],
      unsupported: [],
      heroSource: "https://cdn.test/p.webp",
    });
    expect(results).toHaveLength(9);
    expect(failedGates(results)).toEqual([]);
    const bad = runGates({ draft: goodDraft(), slug: "x", supported, catalogue, broken: ["/x/y"], existing: [], unsupported: null, heroSource: null });
    expect(failedGates(bad)).toEqual(["links", "verifier", "image"]);
  });
});
