import { describe, expect, it } from "vitest";
import { modelAnswer, modelDescription, modelFaq, modelH1, modelTitle } from "@/lib/seo/model-copy";
import { DEALER_WORDING } from "@/lib/seo/llms";

const FPD3 = {
  root: "M18 FPD3",
  kind: "Κρουστικό δραπανοκατσάβιδο",
  platform: "M18" as const,
  fuel: true,
  keySpec: { key: "torque" as const, value: "158", unit: "NM" },
  versions: [
    { code: "M18 FPD3-0X", code2: "4933479859", content: "bare" as const, contents: null, availability: "stock" as const },
    {
      code: "M18 FPD3-502X",
      code2: "4933479860",
      content: "kit" as const,
      contents: "2 μπαταρίες M18 B5 5,0 Ah, φορτιστής M12-18 FC, HD Box.",
      availability: "stock" as const,
    },
  ],
};

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("model copy", () => {
  it("H1 and title name the model and what it is", () => {
    expect(modelH1(FPD3)).toBe("Milwaukee M18 FPD3 — Κρουστικό δραπανοκατσάβιδο");
    const title = modelTitle(FPD3);
    expect(title.startsWith("Milwaukee M18 FPD3 ")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(65);
  });

  it("describes the versions with their codes within 155 characters", () => {
    const d = modelDescription(FPD3);
    expect(d).toContain("4933479859");
    expect(d.length).toBeLessThanOrEqual(155);
  });

  it("answers in 40–60 words: what, platform, key figure, versions, who it suits", () => {
    const a = modelAnswer(FPD3);
    expect(words(a)).toBeGreaterThanOrEqual(40);
    expect(words(a)).toBeLessThanOrEqual(60);
    expect(a).toContain("κρουστικό δραπανοκατσάβιδο");
    expect(a).toContain("M18 FUEL");
    expect(a).toContain("158 Nm");
    expect(a).toContain("M18 FPD3-0X");
    expect(a).not.toMatch(DEALER_WORDING);
  });

  it("quotes a kind that kept its ERP capitals instead of misspelling it", () => {
    expect(modelAnswer({ ...FPD3, kind: 'ΜΠΟΥΛ/ΔΟ 1/2"' })).toContain('(«ΜΠΟΥΛ/ΔΟ 1/2"»)');
  });

  it("asks only what the data answers", () => {
    const faq = modelFaq(FPD3);
    expect(faq.map((p) => p.q)).toEqual([
      "Ποιες εκδόσεις υπάρχουν του Milwaukee M18 FPD3 και ποιοι είναι οι κωδικοί τους;",
      "Ποια είναι η διαφορά ανάμεσα στο M18 FPD3-0X και το M18 FPD3-502X;",
      "Πόση ροπή έχει το Milwaukee M18 FPD3;",
      "Ποιες μπαταρίες ταιριάζουν στο Milwaukee M18 FPD3;",
    ]);
    expect(faq[0].a).toContain("M18 FPD3-502X, κωδικός 4933479860: με 2 μπαταρίες M18 B5 5,0 Ah");
    const noSpec = modelFaq({ ...FPD3, keySpec: null, versions: [FPD3.versions[0]] });
    expect(noSpec.map((p) => p.q)).toEqual([
      "Ποιος είναι ο κωδικός του Milwaukee M18 FPD3-0X;",
      "Ποιες μπαταρίες ταιριάζουν στο Milwaukee M18 FPD3;",
    ]);
  });
});
