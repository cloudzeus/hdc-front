import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { STORE_FACTS, type FactPack } from "@/lib/content-auto/fact-pack";
import {
  extractJson,
  parseWriterReply,
  verifierPrompt,
  verifyArticle,
  writeArticle,
  writerPrompt,
  type Chat,
} from "@/lib/content-auto/writer";

const pack: FactPack = {
  topic: { kind: "MODEL", title: "Milwaukee M18 FPD3", keyword: "m18 fpd3", keywords: ["m18 fpd3"], categoryName: null },
  articleKind: "ARTICLE",
  products: [
    {
      code: "4933479859",
      name: "ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-0X",
      model: "M18 FPD3-0X",
      root: "M18 FPD3",
      platform: "M18",
      fuel: true,
      oneKey: false,
      content: "σκέτο εργαλείο",
      kit: null,
      url: "/proion/fpd3-0x",
      description: null,
      specs: [{ label: "Μέγιστη ροπή (Nm)", value: "158" }],
      official: [],
      officialUrl: null,
      image: "https://cdn.test/secret-photo.webp",
    },
  ],
  links: [{ href: "/proion/fpd3-0x", anchor: "M18 FPD3-0X" }],
  store: STORE_FACTS,
  sources: [],
  representative: "4933479859",
  notes: [],
};

const reply = {
  title: "Milwaukee M18 FPD3: εκδόσεις",
  seoTitle: "Milwaukee M18 FPD3",
  metaDescription: "Όλα για το M18 FPD3.",
  answer: "**Σύντομη απάντηση:** Το M18 FPD3 δίνει 158 Nm.",
  body: "# Τίτλος\n\n## Τι είναι;\n\nΚείμενο.\n\n![x](https://a.b/c.webp)\n\n## Συχνές ερωτήσεις\n\n### Πόση ροπή;\n158 Nm.",
  faq: [{ q: "Έχει κρούση;", a: "Ναι." }],
  keywords: ["m18 fpd3", "m18 fpd3"],
  entities: ["Milwaukee"],
  heroProductCode: "4933479859",
  heroImageAlt: "Δραπανοκατσάβιδο Milwaukee M18 FPD3-0X",
  imageAlts: [{ code: "4933479859", alt: "Δραπανοκατσάβιδο Milwaukee M18 FPD3-0X" }],
};

const answer = (text: string, tokens = 100) => ({ text, usage: { promptTokens: tokens, completionTokens: tokens } });

describe("prompts", () => {
  it("give the writer the pack and the rules, never a photo", () => {
    const { system, user } = writerPrompt(pack, { title: "Πώς διαλέγω δράπανο", answer: "Απάντηση.", body: "## Ενότητα", faq: [] });
    expect(system).toMatch(/ΜΟΝΟ από το ΠΑΚΕΤΟ/);
    expect(system).toMatch(/αντιπρόσωπος/);
    expect(user).toContain("Πώς διαλέγω δράπανο");
    expect(user).toContain("4933479859");
    expect(user).not.toContain("secret-photo");
    expect(verifierPrompt(pack, parseWriterReply(JSON.stringify(reply)).draft).user).toContain("158 Nm");
  });
});

describe("parsing", () => {
  it("tolerates fences and chatter around the JSON", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Ορίστε: {"a":1} τέλος')).toEqual({ a: 1 });
  });

  it("normalises the body: no H1, no image, no answer label, FAQ out of the body", () => {
    const { draft, imageAlts } = parseWriterReply(JSON.stringify(reply));
    expect(draft.answer).toBe("Το M18 FPD3 δίνει 158 Nm.");
    expect(draft.body).not.toMatch(/^# |!\[|Συχνές ερωτήσεις/m);
    expect(draft.body).toContain("## Τι είναι;");
    expect(draft.faq).toEqual([{ q: "Έχει κρούση;", a: "Ναι." }]);
    expect(draft.keywords).toEqual(["m18 fpd3"]);
    expect(imageAlts["4933479859"]).toMatch(/Milwaukee/);
  });
});

describe("writeArticle", () => {
  it("asks once more when the reply is not valid JSON, and counts every token", async () => {
    const chat = vi.fn<Chat>().mockResolvedValueOnce(answer("δεν είναι JSON")).mockResolvedValueOnce(answer(JSON.stringify(reply), 50));
    const out = await writeArticle(pack, null, chat);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[1][0].user).toMatch(/ΜΟΝΟ το αντικείμενο JSON/);
    expect(out.tokens).toBe(300);
    expect(out.attempts).toBe(2);
    expect(out.heroProductCode).toBe("4933479859");
  });

  it("fails after the second bad reply", async () => {
    const chat = vi.fn<Chat>().mockResolvedValue(answer('{"title":"μόνο αυτό"}'));
    await expect(writeArticle(pack, null, chat)).rejects.toThrow(/έγκυρο JSON/);
    expect(chat).toHaveBeenCalledTimes(2);
  });
});

describe("verifyArticle", () => {
  it("returns the unsupported claims", async () => {
    const chat = vi.fn<Chat>().mockResolvedValue(answer('{"unsupported":[{"claim":"3 ταχύτητες","reason":"όχι στο πακέτο"}]}'));
    const { draft } = parseWriterReply(JSON.stringify(reply));
    const out = await verifyArticle(pack, draft, chat);
    expect(out.unsupported).toEqual([{ claim: "3 ταχύτητες", reason: "όχι στο πακέτο" }]);
    expect(chat.mock.calls[0][0].temperature).toBe(0);
  });

  it("returns none when everything is supported", async () => {
    const chat = vi.fn<Chat>().mockResolvedValue(answer('{"unsupported":[]}'));
    const { draft } = parseWriterReply(JSON.stringify(reply));
    expect((await verifyArticle(pack, draft, chat)).unsupported).toEqual([]);
  });
});
