import { describe, expect, it } from "vitest";
import {
  GATE_LABELS,
  aiTellsGate,
  bareKitGate,
  codesGate,
  failedGates,
  forbiddenGate,
  greekShare,
  imageGate,
  languageGate,
  lengthsGate,
  linksGate,
  namesFrom,
  numbersGate,
  carriesFact,
  metadataProblem,
  reclassify,
  runGates,
  sanitizeMetadata,
  selfContradicting,
  uniqueGate,
  verifierGate,
  type Catalogue,
  type Draft,
  type LinkRules,
} from "@/lib/content-auto/gates";
import { DEALER_WORDING } from "@/lib/seo/dealer-wording";
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
      { q: "Τι περιέχει το κιτ M18 FPD3-502X;", a: "Δύο μπαταρίες 5,0 Ah, φορτιστή και βαλίτσα." },
    ],
    keywords: ["m18 fpd3", "κρουστικό δραπανοκατσάβιδο milwaukee", "δραπανοκατσάβιδο μπαταρίας", "m18 fpd3 milwaukee"],
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
    { label: "Μέγιστη συχνότητα κρούσης (bpm)", value: "0-33.000" },
    { label: "Υποδοχή", value: '1/2"' },
  ],
);

const links: LinkRules = { allowed: new Set(["/proion/fpd3-kit", "/katalogos/drapana"]), placedImages: [], broken: [] };
const names = namesFrom(["Milwaukee Heavy Duty Centre", "M18 FPD3-502X", "M18 FPD3-0X", "M18 FUEL", "4933479859"]);

describe("gate · numbers", () => {
  it("passes when every number with a unit is in the pack", () => {
    expect(numbersGate(goodDraft(), supported).problems).toEqual([]);
  });
  it("fails on a number the pack does not state", () => {
    const r = numbersGate({ ...goodDraft(), answer: "Δίνει 135 Nm." }, supported);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain("135 Nm");
  });
  it.each([
    ["case and the Greek Ν", "Δίνει 135 NM και 140 Νm."],
    ["a unit the first version missed", "Βάρος 2 κιλά, ισχύς 1,5 kW, 90 dB(A), 60 °C, δόνηση 4,5 m/s²."],
    ["inches", 'Υποδοχή 3/8" και ½″.'],
    ["a multiplier before the number", "Κιτ 2x12,0Ah."],
    ["a number word before a unit", "Δίνει δεκαοκτώ V."],
    ["a bare number of ten or more", "Είναι 30 φορές πιο γρήγορο."],
    ["a percentage", "30% πιο γρήγορο."],
    ["a guarantee in years", "Με εγγύηση 5 ετών."],
    ["«33 bpm» against the pack's «0-33.000 bpm»", "Δίνει 33 bpm."],
  ])("fails on %s", (_label, answer) => {
    expect(numbersGate({ ...goodDraft(), answer }, supported).ok).toBe(false);
  });
  it("accepts what the pack states in another spelling", () => {
    const d = { ...goodDraft(), answer: 'Δίνει 158 NM, 2.100 σ.α.λ., 33.000 bpm, κιτ 2 × 5,0 Ah, υποδοχή ½".' };
    expect(numbersGate(d, supported).problems).toEqual([]);
  });
  it("reads keywords, entities and the photos' alt texts too", () => {
    expect(numbersGate({ ...goodDraft(), keywords: ["m18 fpd3 135 nm"] }, supported).ok).toBe(false);
    expect(numbersGate(goodDraft(), supported, ["Δραπανοκατσάβιδο με 99 Nm"]).ok).toBe(false);
  });
});

describe("gate · codes and models", () => {
  it("passes on codes and models of the catalogue", () => {
    const d = { ...goodDraft(), faq: [...goodDraft().faq, { q: "Κωδικός;", a: "4933479859, M18 FPD3-0X, με M18 B5." }] };
    expect(codesGate(d, catalogue).ok).toBe(true);
  });
  it("fails on an unknown code or model, in code spans and alts too", () => {
    const r = codesGate({ ...goodDraft(), answer: "Το `M18 FPD2-502X` και ο κωδικός 4933000000." }, catalogue);
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/4933000000/);
    expect(r.problems.join(" ")).toMatch(/M18 FPD2-502X/);
    expect(codesGate(goodDraft(), catalogue, ["Milwaukee M18 FID9-0X"]).ok).toBe(false);
  });
});

describe("gate · codes accepts what the pack names verbatim", () => {
  it("a kit's battery named in the pack, not sold on its own", () => {
    const d = { ...goodDraft(), answer: "Το κιτ έχει δύο M18 HB8 και ο κωδικός 4932471070 της μπαταρίας." };
    expect(codesGate(d, catalogue).ok).toBe(false);
    expect(codesGate(d, catalogue, [], '{"κιτ":"2 x M18 HB8","κωδικός":"4932471070"}').problems).toEqual([]);
  });
  it("still refuses what is in neither", () => {
    expect(codesGate({ ...goodDraft(), answer: "Το M18 HB12." }, catalogue, [], "M18 HB8").ok).toBe(false);
  });
});

describe("keywords and entities are metadata", () => {
  it("drops the ones that would trip a gate, and says why", () => {
    const d = {
      ...goodDraft(),
      keywords: ["m18 fpd3", "m18 fpd3 τιμη", "φθηνό δραπανοκατσάβιδο", "προσφορά milwaukee", "αγορά online m18", "κρουστικό m18"],
      entities: ["Milwaukee", "Makita", "Αντιπρόσωπος Milwaukee"],
    };
    const { draft, dropped } = sanitizeMetadata(d);
    expect(draft.keywords).toEqual(["m18 fpd3", "κρουστικό m18"]);
    expect(draft.entities).toEqual(["Milwaukee"]);
    expect(dropped.map((x) => x.why)).toEqual(["τιμή", "εμπορικός όρος", "εμπορικός όρος", "εμπορικός όρος", "άλλη μάρκα", "αντιπρόσωπος"]);
    expect(metadataProblem("m18 fpd3")).toBeNull();
  });
  it("fewer than four keywords left fails the lengths gate", () => {
    expect(lengthsGate({ ...goodDraft(), keywords: ["a", "b", "c"] }).problems).toEqual(["3 λέξεις-κλειδιά (τουλάχιστον 4)"]);
  });
});

describe("gate · forbidden", () => {
  it("passes a clean text, the battery's fuel gauge and «διανομή» of a panel included", () => {
    const d = { ...goodDraft(), answer: "Ο μετρητής αποθέματος δείχνει τη φόρτιση. Η CAT III αφορά διανομή μέσα στο κτίριο. Τρυπάει χοντρό ξύλο." };
    expect(forbiddenGate(d).problems).toEqual([]);
  });
  it.each([
    ["τιμή", "Κοστίζει λίγο."],
    ["τιμή without accents, in capitals", "ΚΑΛΗ ΤΙΜΗ ΣΤΟ ΚΑΤΑΣΤΗΜΑ."],
    ["τιμές", "Δείτε τις τιμες."],
    ["ευρώ", "Με 250 ευρώ."],
    ["€ entity", "Μόνο 99&#8364;."],
    ["dollar", "Μόνο $99."],
    ["απόθεμα", "ΥΠΑΡΧΕΙ ΣΕ ΑΠΟΘΕΜΑ."],
    ["τεμάχια", "Έχουμε 12 τεμάχια."],
    ["κομμάτια", "Λίγα κομμάτια."],
    ["διαθεσιμότητα", "Ελέγξτε τη διαθεσιμοτητα."],
    ["άμεσα διαθέσιμο", "Αμεσα διαθεσιμο."],
    ["ετοιμοπαράδοτο", "Ετοιμοπαράδοτο."],
    ["περιορισμένη ποσότητα", "Περιορισμένη ποσότητα."],
    ["αντιπρόσωπος", "Είμαστε ΑΝΤΙΠΡΟΣΩΠΟΙ."],
    ["εξουσιοδοτημένος", "Εξουσιοδοτημενο κατάστημα."],
    ["διανομέας", "Επίσημος διανομέας."],
    ["επίσημος συνεργάτης", "Επισημος συνεργατης της Milwaukee."],
    ["certified partner", "Certified partner."],
    ["dealer", "Milwaukee dealer."],
    ["χονδρική", "Τιμές χονδρικής."],
    ["χοντρική", "Χοντρική πώληση."],
    ["wholesale", "Wholesale."],
    ["B2B", "Πωλήσεις B2B."],
    ["εταιρικοί πελάτες", "Για εταιρικους πελατες."],
    ["Makita", "Πιο δυνατό από το Makita."],
    ["Μακίτα", "Πιο δυνατό από το Μάκιτα."],
    ["Μπος", "Σαν το Μπος."],
    ["Ντεγουόλτ", "Σαν το Ντεγουόλτ."],
    ["Στάνλεϊ", "Σαν το Στάνλεϊ."],
  ])("fails on %s", (_label, answer) => {
    expect(forbiddenGate({ ...goodDraft(), answer }).ok).toBe(false);
  });
  it("reads keywords, entities, alts and code", () => {
    expect(forbiddenGate({ ...goodDraft(), keywords: ["m18 fpd3 τιμη"] }).ok).toBe(false);
    expect(forbiddenGate({ ...goodDraft(), entities: ["Εξουσιοδοτημένος αντιπρόσωπος"] }).ok).toBe(false);
    expect(forbiddenGate(goodDraft(), ["Φωτογραφία με τιμή"]).ok).toBe(false);
    expect(forbiddenGate({ ...goodDraft(), body: `${goodDraft().body}\n\n\`\`\`\nαπόθεμα 3\n\`\`\`` }).ok).toBe(false);
  });
  it("the shared dealer wording, used by the manual publish check, is accent- and case-insensitive", () => {
    for (const text of ["ΑΝΤΙΠΡΟΣΩΠΟΣ", "αντιπροσωπος", "Αντιπρόσωπος", "εξουσιοδοτημενος", "ΔΙΑΝΟΜΕΑΣ", "Authorised dealer"]) {
      expect(DEALER_WORDING.test(text)).toBe(true);
    }
    expect(DEALER_WORDING.test("Η CAT III αφορά διανομή μέσα στο κτίριο.")).toBe(false);
  });
});

describe("gate · a bare tool comes without batteries", () => {
  it("fails on the catalogue's real kit row next to a bare model", () => {
    const answer = "Το M18 FMTIW2F12-0X περιλαμβάνει 2 x M18 B5, M12-18 FC, HD Box.";
    const r = bareKitGate({ ...goodDraft(), answer });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain("M18 FMTIW2F12-0X");
  });
  it.each([
    "Το M18 FPD3-0X έρχεται με δύο μπαταρίες.",
    "M18 FPD3-0X | 5,0 Ah | HD Box",
    "Το M18 FPD3-0C έχει φορτιστή.",
  ])("fails on «%s»", (answer) => {
    expect(bareKitGate({ ...goodDraft(), answer }).ok).toBe(false);
  });
  it("passes «χωρίς», a kit, batteries in general, and the reader's own batteries", () => {
    for (const answer of [
      "Αν έχετε ήδη μπαταρίες M18 και φορτιστή, το M18 FBLG3-0 δουλεύει με ό,τι έχετε.",
      "Αν έχετε φορτιστή M12-18 FC, πάρτε το M18 FPD3-0X.",
      "Το M18 FPD3-0X δουλεύει με τις δικές σας μπαταρίες 5,0 Ah.",
      "Το M18 FPD3-0X έρχεται χωρίς μπαταρίες και φορτιστή.",
      "Το M18 FPD3-502X έχει δύο μπαταρίες 5,0 Ah.",
      "Το M18 FPD3-0X δουλεύει με όλες τις μπαταρίες M18.",
    ]) {
      expect(bareKitGate({ ...goodDraft(), answer }).problems).toEqual([]);
    }
  });
  it("reads the alt texts", () => {
    expect(bareKitGate(goodDraft(), ["Milwaukee M18 FPD3-0X με δύο μπαταρίες 5,0 Ah"]).ok).toBe(false);
  });
  it("looks only from the bare model to the next model: a kit named after it keeps its batteries", () => {
    const answer = "Ο M18 FBLG3 σε δύο εκδόσεις: σκέτο εργαλείο M18 FBLG3-0 ή κιτ M18 FBLG3-802 με δύο μπαταρίες 8,0 Ah.";
    expect(bareKitGate({ ...goodDraft(), answer }).problems).toEqual([]);
    // …but batteries right after the bare model still fail, even with a kit later in the sentence.
    const wrong = "Το M18 FBLG3-0 με δύο μπαταρίες 8,0 Ah, όπως και το M18 FBLG3-802.";
    expect(bareKitGate({ ...goodDraft(), answer: wrong }).ok).toBe(false);
    // A battery model is part of the claim, not the next product.
    expect(bareKitGate({ ...goodDraft(), answer: "Το M18 FBLG3-0 παίρνει 2 x M18 FB8 στο σετ." }).ok).toBe(false);
  });
});

describe("gate · AI tells", () => {
  it("passes plain shop Greek", () => {
    expect(aiTellsGate(goodDraft()).problems).toEqual([]);
  });
  it.each([
    ["Στον σημερινό κόσμο", "Στον σημερινό κόσμο όλα τρέχουν."],
    ["Ας δούμε", "Ας δούμε τις εκδόσεις."],
    ["Συμπερασματικά", "ΣΥΜΠΕΡΑΣΜΑΤΙΚΑ, είναι καλό."],
    ["εξαιρετική επιλογή", "Είναι εξαιρετικη επιλογη."],
    ["μη διστάσετε", "Μη διστάσετε να ρωτήσετε."],
    ["game changer", "Ένα game changer."],
    ["κάνει τη διαφορά", "Κάνει τη διαφορά."],
    ["three exclamation marks", "Δυνατό! Γρήγορο! Ελαφρύ!"],
    ["an emoji", "Δυνατό 💪"],
  ])("fails on %s", (_label, answer) => {
    expect(aiTellsGate({ ...goodDraft(), answer }).ok).toBe(false);
  });
  it("allows a trademark sign and two exclamation marks", () => {
    expect(aiTellsGate({ ...goodDraft(), answer: "M18 FUEL™ και REDLITHIUM®! Σωστά!" }).ok).toBe(true);
  });
  it("is shown in the run history", () => {
    expect(GATE_LABELS.aiTells).toBe("Κλισέ AI");
  });
});

describe("gate · links", () => {
  it("passes links of the pack, and our inline photos", () => {
    const d = { ...goodDraft(), body: `${goodDraft().body}\n\n![Κιτ](https://cdn.test/kit.webp)` };
    expect(linksGate(d, { ...links, placedImages: ["https://cdn.test/kit.webp"] }).problems).toEqual([]);
  });
  it.each([
    ["a link outside the pack", "Δείτε [εδώ](/katalogos/allo)."],
    ["an external link", "Δείτε [εδώ](https://www.milwaukeetool.eu/x)."],
    ["a scheme in plain text", "Γράψτε στο mailto:info@example.gr."],
    ["www in plain text", "Δείτε www.milwaukeetool.eu για περισσότερα."],
    ["a bare domain", "Δείτε το milwaukeetool.eu για περισσότερα."],
    ["an image we did not place", "![x](https://cdn.test/other.webp)"],
  ])("fails on %s", (_label, answer) => {
    expect(linksGate({ ...goodDraft(), answer }, links).ok).toBe(false);
  });
  it("fails on an internal link that leads nowhere", () => {
    const r = linksGate(goodDraft(), { ...links, broken: ["/proion/fpd3-kit"] });
    expect(r.problems.join(" ")).toContain("/proion/fpd3-kit");
  });
});

describe("gate · lengths", () => {
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
    expect(lengthsGate(d).problems).toHaveLength(6);
  });
});

describe("gate · language", () => {
  it("counts out only the names of the pack and the catalogue", () => {
    expect(greekShare("Το Milwaukee M18 FPD3-502X είναι δυνατό.", names)).toBe(1);
    expect(languageGate(goodDraft(), names).ok).toBe(true);
  });
  it("does not count out what the writer declares as an entity", () => {
    const d = { ...goodDraft(), entities: ["This", "drill"], answer: "This drill is a very good choice for most jobs. ".repeat(60) };
    expect(languageGate(d, names).ok).toBe(false);
  });
});

describe("gate · uniqueness", () => {
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

describe("gate · verifier", () => {
  it("passes with no unsupported claim", () => {
    expect(verifierGate([]).ok).toBe(true);
  });
  it("fails on one unsupported fact, or when the check did not run", () => {
    expect(verifierGate([{ claim: "Έχει 3 ταχύτητες", reason: "το πακέτο λέει 2", kind: "fact" }]).ok).toBe(false);
    expect(verifierGate(null).ok).toBe(false);
  });
  it("an item without a kind is a fact: fail closed", () => {
    expect(verifierGate([{ claim: "Έχει 3 ταχύτητες" }]).ok).toBe(false);
  });
  it("advice does not block, and is kept as a note for the next revision", () => {
    const r = verifierGate([{ claim: "Για μεγάλες επιφάνειες δουλέψτε σταθερά", kind: "advice" }]);
    expect(r.ok).toBe(true);
    expect(r.notes).toEqual(["Συμβουλή πιο γενικά: «Για μεγάλες επιφάνειες δουλέψτε σταθερά»"]);
    const mixed = verifierGate([
      { claim: "Κλειδώνει στο cruise control", kind: "fact" },
      { claim: "Δουλέψτε σταθερά", kind: "advice" },
    ]);
    expect(mixed.ok).toBe(false);
    expect(mixed.problems).toHaveLength(1);
  });
});

describe("verifier findings: deterministic reclassification", () => {
  it.each([
    "Σε αποθήκη καθαρίζει ράφια",
    "Σε συνεργείο σπρώχνει ρινίσματα από τις γωνίες",
    "Αν δουλεύετε σε χώρο με πολλή σκόνη, ένα προστατευτικό ματιών βοηθά",
    "Σε αυλές και πεζοδρόμια μαζεύει φύλλα και χαλαρά υλικά",
  ])("«%s» carries no product fact: advice", (claim) => {
    expect(carriesFact(claim)).toBe(false);
  });
  it.each([
    ["a number", "Φτάνει σε 1 δευτερόλεπτο"],
    ["a unit", "Δίνει περισσότερα Nm"],
    ["a model", "Το M18 FBLG3-0 καθαρίζει ράφια"],
    ["a code", "Ο 4933493301 καθαρίζει ράφια"],
    ["a glossary term", "Το REDLINK PLUS το προστατεύει"],
    ["a spec label of the pack", "Έχει cruise control για μεγάλες επιφάνειες"],
    ["«αδιάβροχο»", "Είναι αδιάβροχο"],
    ["«αντοχή»", "Έχει μεγάλη αντοχή στη σκόνη"],
    ["«διάρκεια μπαταρίας»", "Καλή διάρκεια μπαταρίας"],
    ["«συμβατό»", "Συμβατό με τα αξεσουάρ"],
    ["«ταιριάζει με»", "Ταιριάζει με όλα τα ακροφύσια"],
    ["a battery", "Δουλεύει με όλες τις μπαταρίες"],
    ["a charger", "Φορτίζει στον φορτιστή σας"],
    ["a kit", "Το κιτ είναι πλήρες"],
    ["«έρχεται με»", "Έρχεται με θήκη"],
    ["a store claim", "Γρήγορη αποστολή από το κατάστημα"],
    ["a guarantee", "Με εγγύηση Milwaukee"],
  ])("%s keeps it a fact", (_label, claim) => {
    expect(carriesFact(claim, ["Cruise control", "REDLINK PLUS"])).toBe(true);
  });
  it("turns only contentless facts into advice, and says which", () => {
    const { items, reclassified } = reclassify([
      { claim: "Σε αποθήκη καθαρίζει ράφια", kind: "fact" },
      { claim: "Δίνει 250 Nm", kind: "fact" },
    ]);
    expect(items!.map((u) => u.kind)).toEqual(["advice", "fact"]);
    expect(reclassified).toEqual(["Σε αποθήκη καθαρίζει ράφια"]);
    expect(verifierGate(items).ok).toBe(false);
    expect(reclassify(null).items).toBeNull();
  });
});

describe("self-contradicting verifier findings", () => {
  it.each([
    "Η περιγραφή αποδίδει στο -802 δύο μπαταρίες, που στηρίζονται από το πακέτο.",
    "Το στοιχείο υπάρχει στο πακέτο.",
    "The claim is supported by the pack.",
  ])("«%s» says the claim is supported: ask again", (reason) => {
    expect(selfContradicting({ claim: "x", reason })).toBe(true);
  });
  it.each([
    "Δεν στηρίζεται από το πακέτο.",
    "Ο ισχυρισμός δε στηρίζεται.",
    "Unsupported by the pack.",
    "Το πακέτο δεν αναφέρει χρόνο λειτουργίας.",
  ])("«%s» is an ordinary finding", (reason) => {
    expect(selfContradicting({ claim: "x", reason })).toBe(false);
  });
});

describe("gate · image", () => {
  it("passes with an uploaded hero and fails without one", () => {
    expect(imageGate("https://cdn.test/hero.webp").ok).toBe(true);
    expect(imageGate(null).problems[0]).toMatch(/no image/);
    expect(imageGate(null, "Η φωτογραφία δεν ανέβηκε").problems[0]).toMatch(/δεν ανέβηκε/);
  });
});

describe("runGates", () => {
  const input = {
    draft: goodDraft(),
    alts: ["Κρουστικό δραπανοκατσάβιδο Milwaukee M18 FPD3-502X"],
    slug: "milwaukee-m18-fpd3-ekdoseis",
    supported,
    catalogue,
    links,
    names,
    existing: [],
    unsupported: [],
    heroImageUrl: "https://cdn.test/hero.webp",
  };
  it("runs all eleven and reports the failed ones", () => {
    const results = runGates(input);
    expect(results).toHaveLength(11);
    expect(failedGates(results)).toEqual([]);
    const bad = runGates({ ...input, links: { ...links, broken: ["/x/y"] }, unsupported: null, heroImageUrl: null });
    expect(failedGates(bad)).toEqual(["links", "verifier", "image"]);
  });
});
