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
  /** Slugs that exist already. */
  slugs: new Set<string>(),
  /** publishedAt of automatic articles already out. */
  published: [] as Date[],
  /** The run row is still open. */
  open: true,
  enabled: "on",
}));

vi.mock("@/lib/prisma", () => {
  const client = {
    contentJobRun: {
      findUnique: vi.fn(async () => db.run),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (!db.open) return { count: 0 };
        db.open = false;
        db.runUpdates.push(data);
        return { count: 1 };
      }),
      count: vi.fn(async () => 0),
    },
    contentArticle: {
      findMany: vi.fn(async ({ select, where }: { select: Record<string, unknown>; where?: Record<string, unknown> }) =>
        where && "source" in where
          ? db.published.map((publishedAt) => ({ publishedAt }))
          : "keywords" in select
            ? [{ id: "a1", slug: "pos-dialego-drapano", title: "Πώς διαλέγω δράπανο", keywords: ["δράπανο"] }, ...[...db.slugs].map((slug) => ({ id: `x-${slug}`, slug, title: "Άλλο θέμα εντελώς", keywords: ["κάτι"] }))]
            : [{ slug: "pos-dialego-drapano", title: "Πώς διαλέγω δράπανο", answer: "Απάντηση.", body: "## Ενότητα\n\nΚείμενο.", faq: [] }],
      ),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; slug?: string } }) =>
        where.id ? db.previous : where.slug && db.slugs.has(where.slug) ? { id: `x-${where.slug}` } : null,
      ),
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
    // One transaction: if the callback throws, nothing it wrote stays.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const before = { articles: db.articleWrites.length, topics: db.topicUpdates.length };
      try {
        return await fn(client);
      } catch (error) {
        db.articleWrites.length = before.articles;
        db.topicUpdates.length = before.topics;
        throw error;
      }
    }),
  };
  return { prisma: client };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/settings/settings", () => ({
  getSetting: vi.fn(async (key: string) => (key === "content.auto.enabled" ? db.enabled : "")),
}));
vi.mock("@/lib/seo/admin-data", () => ({ brokenLinks: vi.fn(async () => []) }));
vi.mock("@/lib/mail/content-auto-email", () => ({ sendContentRunEmail: vi.fn(async () => null), contentAdminUrl: () => "/admin/seo?tab=auto" }));
const images = vi.hoisted(() => ({
  uploadHero: vi.fn(async (slug: string) => `https://cdn.test/eshop/content/${slug}/hero.webp`),
}));
vi.mock("@/lib/content-auto/images", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/content-auto/images")>()),
  uploadHero: images.uploadHero,
  // No network: the first candidate is taken, as if it were a packshot.
  pickHeroPhoto: vi.fn(async (candidates: Array<{ code: string; url: string }>) =>
    candidates[0] ? { ...candidates[0], photo: Buffer.from("x") } : null,
  ),
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
  keywords: ["m18 fpd3", "milwaukee m18 fpd3", "κρουστικό δραπανοκατσάβιδο m18", "δραπανοκατσάβιδο μπαταρίας milwaukee"],
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
  db.slugs = new Set();
  db.published = [];
  db.open = true;
  db.enabled = "on";
  images.uploadHero.mockClear();
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
    const out = await executeRun("run1", { chat: chatWith(article({ answer: "Κοστίζει 199 € και δίνει 135 Nm." }), [{ claim: "Έχει 3 ταχύτητες" }]) });
    expect(out.outcome).toBe("DRAFT");
    expect(out.failedGates).toEqual(expect.arrayContaining(["numbers", "forbidden", "lengths", "verifier"]));
    expect(db.articleWrites[0].data).toMatchObject({ status: "DRAFT" });
    expect(db.topicUpdates[0]).toMatchObject({ status: "FAILED", attempts: 1 });
  });

  it("sends a failing draft back ONCE with its exact failures, and publishes the clean revision", async () => {
    setRun("manual-publish");
    const bad = article({ answer: "Κοστίζει 199 € και δίνει 135 Nm." });
    const writes: string[] = [];
    const chat = vi.fn<Chat>(async ({ temperature, user }) => {
      if (temperature === 0) return { text: JSON.stringify({ unsupported: [] }), usage: { promptTokens: 100, completionTokens: 50 } };
      writes.push(user);
      return { text: JSON.stringify(writes.length === 1 ? bad : article()), usage: { promptTokens: 1000, completionTokens: 500 } };
    });
    const out = await executeRun("run1", { chat });
    expect(out.outcome).toBe("PUBLISHED");
    expect(writes).toHaveLength(2);
    expect(writes[1]).toContain("ΤΟ ΠΡΟΗΓΟΥΜΕΝΟ ΣΟΥ JSON");
    expect(writes[1]).toContain("135 Nm");
    expect(writes[1]).toMatch(/ΜΗΝ προσθέσεις κανένα νέο στοιχείο/);
    const detail = db.runUpdates[0].detail as { attempts: Array<{ failedGates: string[]; writerTokens: number; verifierTokens: number }> };
    expect(detail.attempts.map((a) => a.failedGates)).toEqual([expect.arrayContaining(["numbers", "forbidden"]), []]);
    expect(detail.attempts[0]).toMatchObject({ writerTokens: 1500, verifierTokens: 150 });
    expect(db.runUpdates[0]).toMatchObject({ tokens: 3300 });
  });

  it("stops after two revisions and fails closed", async () => {
    setRun("manual-publish");
    const chat = chatWith(article(), [{ claim: "Δίνει 250 Nm ροπή" }]);
    const out = await executeRun("run1", { chat });
    expect(out.outcome).toBe("DRAFT");
    expect(out.failedGates).toEqual(["verifier"]);
    expect(chat).toHaveBeenCalledTimes(6); // 3 writes, 3 verifications
    expect((db.runUpdates[0].detail as { attempts: unknown[] }).attempts).toHaveLength(3);
    expect(db.articleWrites[0].data).toMatchObject({ status: "DRAFT" });
  });

  it("advice from the verifier does not block: a clean text with advice notes publishes", async () => {
    setRun("manual-publish");
    const out = await executeRun("run1", { chat: chatWith(article(), [{ claim: "Δουλέψτε σταθερά", kind: "advice" }]) });
    expect(out.outcome).toBe("PUBLISHED");
    const detail = db.runUpdates[0].detail as { attempts: Array<{ advice: string[] }> };
    expect(detail.attempts[0].advice).toEqual(["Συμβουλή πιο γενικά: «Δουλέψτε σταθερά»"]);
  });

  it("a revision asked for a fact also carries the advice, to phrase more generally", async () => {
    setRun("manual-draft");
    const writes: string[] = [];
    const chat = vi.fn<Chat>(async ({ temperature, user }) => {
      if (temperature === 0) {
        const unsupported = writes.length === 1 ? [{ claim: "Έχει 3 ταχύτητες", kind: "fact" }, { claim: "Δουλέψτε σταθερά", kind: "advice" }] : [];
        return { text: JSON.stringify({ unsupported }), usage: { promptTokens: 1, completionTokens: 1 } };
      }
      writes.push(user);
      return { text: JSON.stringify(article()), usage: { promptTokens: 1, completionTokens: 1 } };
    });
    await executeRun("run1", { chat });
    expect(writes).toHaveLength(2);
    expect(writes[1]).toContain("Έχει 3 ταχύτητες");
    expect(writes[1]).toMatch(/Δουλέψτε σταθερά.*πιο γενικά/);
  });

  it("a «fact» with no product fact in it is reclassified as advice, and logged", async () => {
    setRun("manual-publish");
    const out = await executeRun("run1", { chat: chatWith(article(), [{ claim: "Σε αποθήκη καθαρίζει ράφια", kind: "fact" }]) });
    expect(out.outcome).toBe("PUBLISHED");
    const detail = db.runUpdates[0].detail as { attempts: Array<{ reclassifiedAsAdvice: string[] }> };
    expect(detail.attempts[0].reclassifiedAsAdvice).toEqual(["Σε αποθήκη καθαρίζει ράφια"]);
  });

  it("keeps the attempt with the fewest failed gates when none passes, and asks for 850 words", async () => {
    setRun("manual-publish");
    const writes: string[] = [];
    // Attempt 0 fails 1 gate (verifier); attempts 1 and 2 fail 2 (numbers + verifier).
    const chat = vi.fn<Chat>(async ({ temperature, user }) => {
      if (temperature === 0) return { text: JSON.stringify({ unsupported: [{ claim: "Δίνει 250 Nm ροπή", kind: "fact" }] }), usage: { promptTokens: 1, completionTokens: 1 } };
      writes.push(user);
      const text = writes.length === 1 ? article() : article({ title: `Χειρότερο ${writes.length}`, answer: `${article().answer.split(" ").slice(0, 45).join(" ")} 999 Nm.` });
      return { text: JSON.stringify(text), usage: { promptTokens: 1, completionTokens: 1 } };
    });
    const out = await executeRun("run1", { chat });
    expect(writes).toHaveLength(3);
    expect(writes[1]).toContain("Κράτα το σώμα τουλάχιστον 850 λέξεις");
    expect(out.outcome).toBe("DRAFT");
    expect(out.failedGates).toEqual(["verifier"]);
    expect(db.articleWrites[0].data.title).toBe(article().title);
    expect((db.runUpdates[0].detail as { savedAttempt: number }).savedAttempt).toBe(0);
  });

  it("re-asks a finding that says it is supported; drops it only if the re-check agrees", async () => {
    for (const agrees of [true, false]) {
      db.articleWrites = [];
      db.runUpdates = [];
      db.open = true;
      setRun("manual-publish");
      const finding = { claim: "Το κιτ M18 FPD3-502X έχει δύο μπαταρίες 5,0 Ah", reason: "Στηρίζονται από το πακέτο.", kind: "fact" };
      const calls: string[] = [];
      const chat = vi.fn<Chat>(async ({ temperature, system }) => {
        if (temperature !== 0) return { text: JSON.stringify(article()), usage: { promptTokens: 1, completionTokens: 1 } };
        if (system.includes('"results"')) {
          calls.push("recheck");
          return { text: JSON.stringify({ results: [{ claim: finding.claim, supported: agrees }] }), usage: { promptTokens: 1, completionTokens: 1 } };
        }
        calls.push("verify");
        return { text: JSON.stringify({ unsupported: [finding] }), usage: { promptTokens: 1, completionTokens: 1 } };
      });
      const out = await executeRun("run1", { chat, deadlineMs: 5_000 });
      expect(calls.slice(0, 2)).toEqual(["verify", "recheck"]);
      if (agrees) {
        expect(out.outcome).toBe("PUBLISHED");
        expect((db.runUpdates[0].detail as { attempts: Array<{ droppedAfterRecheck: string[] }> }).attempts[0].droppedAfterRecheck).toEqual([finding.claim]);
      } else {
        expect(out.failedGates).toContain("verifier");
      }
    }
  });

  it("stops at the first attempt that passes", async () => {
    setRun("manual-draft");
    const chat = chatWith(article());
    await executeRun("run1", { chat });
    expect(chat).toHaveBeenCalledTimes(2);
    expect((db.runUpdates[0].detail as { attempts: unknown[] }).attempts).toHaveLength(1);
  });

  it("drops a keyword or entity with «τιμή» instead of failing, and logs it", async () => {
    setRun("manual-publish");
    const keywords = [...(article().keywords as string[]), "milwaukee m18 fpd3 τιμη", "m18 fpd3 προσφορα"];
    const out = await executeRun("run1", { chat: chatWith(article({ keywords, entities: ["Milwaukee", "Makita"] })) });
    expect(out.outcome).toBe("PUBLISHED");
    const saved = db.articleWrites[0].data;
    expect(saved.keywords).not.toContain("milwaukee m18 fpd3 τιμη");
    expect(saved.entities).toEqual(["Milwaukee"]);
    const dropped = (db.runUpdates[0].detail as { droppedMetadata: Array<{ value: string }> }).droppedMetadata.map((d) => d.value);
    expect(dropped).toEqual(["milwaukee m18 fpd3 τιμη", "m18 fpd3 προσφορα", "Makita"]);
  });

  it("still fails with fewer than four keywords left", async () => {
    setRun("manual-publish");
    const out = await executeRun("run1", { chat: chatWith(article({ keywords: ["m18 fpd3", "m18 fpd3 τιμη", "φθηνό m18 fpd3"] })) });
    expect(out.outcome).toBe("DRAFT");
    expect(out.failedGates).toEqual(["lengths"]);
  });

  it("C1: a colliding title never touches the existing slug's hero, and uploads nothing", async () => {
    setRun("cron");
    db.slugs.add("milwaukee-m18-fpd3-poia-ekdosi-na-dialexete");
    const out = await executeRun("run1", { chat: chatWith(article()) });
    expect(out.failedGates).toEqual(expect.arrayContaining(["unique", "image"]));
    expect(images.uploadHero).not.toHaveBeenCalled();
    const saved = db.articleWrites[0].data;
    expect(saved.slug).toBe("milwaukee-m18-fpd3-poia-ekdosi-na-dialexete-auto-run1");
    expect(saved).toMatchObject({ status: "DRAFT", heroImageUrl: null });
  });

  it("uploads the hero to the final slug when the text is unique", async () => {
    setRun("manual-draft");
    await executeRun("run1", { chat: chatWith(article()) });
    expect(images.uploadHero).toHaveBeenCalledTimes(1);
    expect(images.uploadHero.mock.calls[0][0]).toBe(db.articleWrites[0].data.slug);
  });

  it("holds a passing text as a draft at the hard caps, for manual-publish too", async () => {
    for (const published of [[new Date()], [1, 2, 3].map((d) => new Date(Date.now() - d * 86_400_000))]) {
      db.articleWrites = [];
      db.open = true;
      db.published = published;
      setRun("manual-publish");
      const out = await executeRun("run1", { chat: chatWith(article()) });
      expect(out.outcome).toBe("DRAFT");
      expect(out.failedGates).toEqual([]);
      expect(db.articleWrites[0].data).toMatchObject({ status: "DRAFT" });
    }
  });

  it("checks the switch again before a cron publication", async () => {
    setRun("cron");
    db.enabled = "off";
    const out = await executeRun("run1", { chat: chatWith(article()) });
    expect(out.outcome).toBe("DRAFT");
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
      db.open = true;
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

  it("an outage (DeepSeek, network) is SKIPPED and costs the topic no attempt", async () => {
    setRun("cron", { attempts: 2 });
    const { DeepSeekError } = await import("@/lib/ai/deepseek");
    const chat = vi.fn<Chat>(async () => {
      throw new DeepSeekError("DeepSeek 503: busy");
    });
    const out = await executeRun("run1", { chat });
    expect(out.outcome).toBe("SKIPPED");
    expect(out.error).toMatch(/^Προσωρινό σφάλμα/);
    expect(db.topicUpdates).toEqual([]);
    expect(db.runUpdates[0]).toMatchObject({ outcome: "SKIPPED" });
  });

  it("the deadline abandons the run: FAILED, nothing saved, no attempt", async () => {
    setRun("manual-publish");
    let release: () => void = () => {};
    const chat = vi.fn<Chat>(
      ({ temperature }) =>
        new Promise((resolve) => {
          release = () => resolve({ text: JSON.stringify(temperature === 0 ? { unsupported: [] } : article()), usage: { promptTokens: 1, completionTokens: 1 } });
        }),
    );
    const out = await executeRun("run1", { chat, deadlineMs: 20 });
    expect(out.outcome).toBe("FAILED");
    expect(out.error).toMatch(/λεπτά/);
    // The writer answers late: the abandoned work must not save or publish anything.
    release();
    await new Promise((r) => setTimeout(r, 30));
    release();
    await new Promise((r) => setTimeout(r, 30));
    expect(db.articleWrites).toEqual([]);
    expect(images.uploadHero).not.toHaveBeenCalled();
    expect(db.topicUpdates).toEqual([]);
  });

  it("a failure after the commit never marks a published article FAILED", async () => {
    setRun("manual-publish");
    const { sendContentRunEmail } = await import("@/lib/mail/content-auto-email");
    vi.mocked(sendContentRunEmail).mockRejectedValueOnce(new Error("mail down"));
    const out = await executeRun("run1", { chat: chatWith(article()) });
    expect(out.outcome).toBe("PUBLISHED");
    expect(db.runUpdates).toHaveLength(1);
    expect(db.runUpdates[0]).toMatchObject({ outcome: "PUBLISHED" });
  });
});
