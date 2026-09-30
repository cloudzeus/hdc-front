import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The runner end to end with everything outside it faked: the database, the
 * fact pack, DeepSeek, the CDN, the mail. Nothing leaves the test.
 */

const db = vi.hoisted(() => ({
  run: null as null | Record<string, unknown>,
  topicUpdates: [] as Array<Record<string, unknown>>,
  articleWrites: [] as Array<{ op: string; data: Record<string, unknown> }>,
  runUpdates: [] as Array<Record<string, unknown>>,
  audits: [] as Array<Record<string, unknown>>,
  previous: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contentJobRun: {
      findUnique: vi.fn(async () => db.run),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (db.runUpdates.push(data), {})),
    },
    contentArticle: {
      findMany: vi.fn(async ({ select }: { select: Record<string, unknown> }) =>
        "keywords" in select
          ? [{ id: "a1", slug: "pos-dialego-drapano", title: "Πώς διαλέγω δράπανο", keywords: ["δράπανο"] }]
          : [{ slug: "pos-dialego-drapano", title: "Πώς διαλέγω δράπανο", answer: "Απάντηση.", body: "## Ενότητα\n\nΚείμενο.", faq: [] }],
      ),
      findUnique: vi.fn(async ({ where }: { where: { id?: string } }) => (where.id ? db.previous : null)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.articleWrites.push({ op: "create", data });
        return { id: "new-article", slug: data.slug, kind: data.kind };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.articleWrites.push({ op: "update", data });
        return { id: "old-article", slug: data.slug, kind: data.kind };
      }),
    },
    contentTopic: { update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (db.topicUpdates.push(data), {})) },
    product: {
      findMany: vi.fn(async () => [
        { code1: "4058546294489", code2: "4933479859", name: "ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-0X FUEL", modelRoot: "M18 FPD3" },
        { code1: "", code2: "4933479860", name: "ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-502X FUEL", modelRoot: "M18 FPD3" },
      ]),
    },
    adminAuditLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (db.audits.push(data), {})) },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/settings/settings", () => ({ getSetting: vi.fn(async () => "") }));
vi.mock("@/lib/seo/admin-data", () => ({ brokenLinks: vi.fn(async () => []) }));
vi.mock("@/lib/mail/content-auto-email", () => ({ sendContentRunEmail: vi.fn(async () => null), contentAdminUrl: () => "/admin/seo?tab=auto" }));
vi.mock("@/lib/content-auto/images", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/content-auto/images")>()),
  uploadHero: vi.fn(async (slug: string) => `https://cdn.test/eshop/content/${slug}/hero.webp`),
}));

const pack = vi.hoisted(() => ({
  topic: { kind: "MODEL", title: "Milwaukee M18 FPD3", keyword: "m18 fpd3", keywords: ["m18 fpd3"], categoryName: null },
  articleKind: "ARTICLE",
  products: [
    {
      code: "4933479859",
      name: "ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-0X FUEL",
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
      image: "https://cdn.test/fpd3-0x.webp",
    },
    {
      code: "4933479860",
      name: "ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-502X FUEL",
      model: "M18 FPD3-502X",
      root: "M18 FPD3",
      platform: "M18",
      fuel: true,
      oneKey: false,
      content: "κιτ",
      kit: "2 μπαταρίες 5,0 Ah",
      url: "/proion/fpd3-502x",
      description: null,
      specs: [{ label: "Μέγιστη ροπή (Nm)", value: "158" }],
      official: [],
      officialUrl: "https://www.milwaukeetool.eu/fpd3",
      image: "https://cdn.test/fpd3-502x.webp",
    },
  ],
  links: [{ href: "/proion/fpd3-502x", anchor: "M18 FPD3-502X" }],
  store: ["Πειραιάς."],
  sources: ["https://www.milwaukeetool.eu/fpd3"],
  representative: "4933479859",
  notes: [],
}));
vi.mock("@/lib/content-auto/fact-pack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/content-auto/fact-pack")>()),
  loadFactPack: vi.fn(async () => pack),
}));

process.env.BUNNY_CDN_HOSTNAME = "cdn.test";

import { executeRun } from "@/lib/content-auto/runner";
import type { Chat } from "@/lib/content-auto/writer";

const para =
  "Το M18 FPD3 είναι κρουστικό δραπανοκατσάβιδο για βίδωμα και τρύπημα σε ξύλο, μέταλλο και τούβλο, με ροπή 158 Nm κατά τη Milwaukee, " +
  "και ταιριάζει σε τεχνίτες που θέλουν ένα εργαλείο για όλη τη μέρα στο εργοτάξιο ή στο συνεργείο χωρίς καλώδιο.";
const section = (h: string) => `## ${h}\n\n${Array.from({ length: 6 }, () => para).join("\n\n")}`;

const article = (over: Record<string, unknown> = {}) => ({
  title: "Milwaukee M18 FPD3: ποια έκδοση να διαλέξετε",
  seoTitle: "Milwaukee M18 FPD3: ποια έκδοση να διαλέξετε",
  metaDescription: "Το M18 FPD3 σε σκέτο εργαλείο ή κιτ με δύο μπαταρίες: τι αλλάζει και για ποιον είναι κάθε έκδοση.",
  answer: Array.from({ length: 48 }, (_, i) => (i === 0 ? "Το" : "εργαλείο")).join(" "),
  body: [
    section("Τι είναι το M18 FPD3;"),
    "Το [M18 FPD3-502X](/proion/fpd3-502x) έρχεται με δύο μπαταρίες 5,0 Ah.",
    section("Κιτ ή σκέτο;"),
    section("Για ποιον είναι;"),
  ].join("\n\n"),
  faq: [
    { q: "Πόση ροπή;", a: "158 Nm." },
    { q: "Κιτ;", a: "Με δύο μπαταρίες 5,0 Ah." },
    { q: "Σκέτο;", a: "Το M18 FPD3-0X." },
    { q: "Μπαταρίες;", a: "Όλες οι M18." },
  ],
  keywords: ["m18 fpd3", "milwaukee m18 fpd3"],
  entities: ["Milwaukee", "M18 FUEL", "M18 FPD3"],
  heroProductCode: "4933479859",
  heroImageAlt: "Κρουστικό δραπανοκατσάβιδο Milwaukee M18 FPD3-0X",
  imageAlts: [],
  ...over,
});

function chatWith(writer: Record<string, unknown>, unsupported: unknown[] = []): Chat {
  return vi.fn<Chat>(async ({ temperature }) => ({
    text: JSON.stringify(temperature === 0 ? { unsupported } : writer),
    usage: { promptTokens: 1000, completionTokens: 500 },
  }));
}

function setRun(trigger: string, topicOver: Record<string, unknown> = {}) {
  db.run = {
    id: "run1",
    trigger,
    topic: {
      id: "t1",
      key: "model:M18 FPD3",
      kind: "MODEL",
      title: "Milwaukee M18 FPD3: εκδόσεις, σύγκριση, για ποιον είναι",
      payload: { articleKind: "ARTICLE", keyword: "milwaukee m18 fpd3", root: "M18 FPD3" },
      attempts: 0,
      articleId: null,
      ...topicOver,
    },
  };
}

beforeEach(() => {
  db.topicUpdates = [];
  db.articleWrites = [];
  db.runUpdates = [];
  db.audits = [];
  db.previous = null;
});

describe("executeRun", () => {
  it("publishes when every gate passes and the mode allows it", async () => {
    setRun("manual-publish");
    const out = await executeRun("run1", { chat: chatWith(article()) });
    expect(out.failedGates).toEqual([]);
    expect(out.outcome).toBe("PUBLISHED");
    const saved = db.articleWrites[0].data;
    expect(saved).toMatchObject({
      status: "PUBLISHED",
      source: "AUTO",
      slug: "milwaukee-m18-fpd3-poia-ekdosi-na-dialexete",
      heroImageUrl: "https://cdn.test/eshop/content/milwaukee-m18-fpd3-poia-ekdosi-na-dialexete/hero.webp",
      heroImageAlt: "Κρουστικό δραπανοκατσάβιδο Milwaukee M18 FPD3-0X",
      sources: ["https://www.milwaukeetool.eu/fpd3"],
    });
    expect(saved.publishedAt).toBeInstanceOf(Date);
    // The kit's catalogue photo after the paragraph that names it; not the hero's.
    expect(String(saved.body)).toContain("](https://cdn.test/fpd3-502x.webp)");
    expect(String(saved.body)).not.toContain("fpd3-0x.webp");
    expect(db.topicUpdates[0]).toMatchObject({ status: "DONE", attempts: 0, articleId: "new-article", pinned: false });
    expect(db.runUpdates[0]).toMatchObject({ outcome: "PUBLISHED", tokens: 3000, failedGates: [] });
    expect(db.audits[0]).toMatchObject({ action: "seo.auto.publish", userId: null });
  });

  it("keeps a clean text a draft in «draft only» mode, and the topic done", async () => {
    setRun("manual-draft");
    const out = await executeRun("run1", { chat: chatWith(article()) });
    expect(out.outcome).toBe("DRAFT");
    expect(db.articleWrites[0].data).toMatchObject({ status: "DRAFT", publishedAt: null });
    expect(db.topicUpdates[0]).toMatchObject({ status: "DONE" });
  });

  it("leaves a text that fails a gate as a draft, counts the attempt and names the gates", async () => {
    setRun("cron");
    const out = await executeRun("run1", { chat: chatWith(article({ answer: "Κοστίζει 199 € και δίνει 135 Nm." }), [{ claim: "x" }]) });
    expect(out.outcome).toBe("DRAFT");
    expect(out.failedGates).toEqual(expect.arrayContaining(["numbers", "forbidden", "lengths", "verifier"]));
    expect(db.articleWrites[0].data).toMatchObject({ status: "DRAFT" });
    expect(db.topicUpdates[0]).toMatchObject({ status: "FAILED", attempts: 1 });
  });

  it("rewrites its own untouched draft in place", async () => {
    setRun("cron", { articleId: "old-article", attempts: 1 });
    db.previous = { id: "old-article", slug: "old-slug", status: "DRAFT", source: "AUTO", updatedBy: "auto:content" };
    await executeRun("run1", { chat: chatWith(article()) });
    expect(db.articleWrites[0]).toMatchObject({ op: "update", data: { slug: "old-slug" } });
  });

  it("never rewrites a draft a person edited, or a published article", async () => {
    for (const previous of [
      { id: "old-article", slug: "s", status: "DRAFT", source: "AUTO", updatedBy: "editor@hdc.test" },
      { id: "old-article", slug: "s", status: "PUBLISHED", source: "AUTO", updatedBy: "auto:content" },
    ]) {
      db.articleWrites = [];
      db.topicUpdates = [];
      setRun("cron", { articleId: "old-article" });
      db.previous = previous;
      const chat = chatWith(article());
      const out = await executeRun("run1", { chat });
      expect(out.outcome).toBe("SKIPPED");
      expect(chat).not.toHaveBeenCalled();
      expect(db.articleWrites).toEqual([]);
      expect(db.topicUpdates[0]).toMatchObject({ status: "DONE" });
    }
  });

  it("skips the topic at the third failure", async () => {
    setRun("cron", { attempts: 2 });
    const chat = vi.fn<Chat>(async () => ({ text: "όχι JSON", usage: { promptTokens: 10, completionTokens: 10 } }));
    const out = await executeRun("run1", { chat });
    expect(out.outcome).toBe("FAILED");
    expect(out.error).toMatch(/έγκυρο JSON/);
    expect(db.topicUpdates[0]).toMatchObject({ status: "SKIPPED", attempts: 3 });
    expect(db.runUpdates[0]).toMatchObject({ outcome: "FAILED", tokens: 40 });
    expect(db.audits[0]).toMatchObject({ action: "seo.auto.fail" });
  });
});
