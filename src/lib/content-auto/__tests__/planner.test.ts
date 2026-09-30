import { describe, expect, it } from "vitest";
import {
  mergeQueue,
  modelScore,
  planTopics,
  eligibleTopic,
  topicOrder,
  type PlannerInput,
  type PlannerModel,
  type StoredTopic,
} from "@/lib/content-auto/planner";
import type { KeywordSeed } from "@/lib/content-auto/keyword-seed";

const now = new Date("2026-09-30T08:00:00Z");

const model = (root: string, over: Partial<PlannerModel> = {}): PlannerModel => ({
  root,
  versions: 3,
  fuel: true,
  oneKey: false,
  slugs: [`${root.toLowerCase().replace(" ", "-")}-0x`],
  newVersions: 0,
  newestInsertedAt: null,
  ...over,
});

const seed: KeywordSeed[] = [
  { id: "sfyria", title: "Σφυριά: πώς διαλέγω", keywords: ["σφυρί"], priority: "L", categorySlugs: ["sfyria"], note: "σημείωση" },
];

const base = (over: Partial<PlannerInput> = {}): PlannerInput => ({
  now,
  models: [],
  categories: [],
  articles: [],
  seed: [],
  ...over,
});

describe("planTopics · models", () => {
  it("plans a model with two or more versions that no article mentions", () => {
    const topics = planTopics(base({ models: [model("M18 FPD3"), model("M18 FID3", { versions: 1 })] }));
    expect(topics.map((t) => t.key)).toEqual(["model:M18 FPD3"]);
    expect(topics[0]).toMatchObject({ kind: "MODEL", title: "Milwaukee M18 FPD3: εκδόσεις, σύγκριση, για ποιον είναι" });
    expect(topics[0].payload).toMatchObject({ articleKind: "ARTICLE", root: "M18 FPD3" });
  });

  it("skips a model an article covers by entity, keyword, model page or version link", () => {
    const article = (over: object) => ({ kind: "ARTICLE" as const, title: "Κάτι άλλο", keywords: [], entities: [], links: [], ...over });
    for (const a of [
      article({ entities: ["M18 FPD3"] }),
      article({ keywords: ["m18 fpd3-502x"] }),
      article({ links: ["/montelo/m18-fpd3"] }),
      article({ links: ["/proion/m18-fpd3-0x"] }),
    ]) {
      expect(planTopics(base({ models: [model("M18 FPD3")], articles: [a] }))).toEqual([]);
    }
  });

  it("scores by versions, FUEL and ONE-KEY", () => {
    expect(modelScore({ versions: 2, fuel: false, oneKey: false })).toBe(36);
    expect(modelScore({ versions: 12, fuel: true, oneKey: true })).toBe(104);
  });

  it("makes a model with new versions a NEW_PRODUCT topic, scored by how recent", () => {
    const fresh = model("M18 FHIW2F12", { newVersions: 1, newestInsertedAt: new Date("2026-09-25T08:00:00Z"), versions: 1 });
    const [topic] = planTopics(base({ models: [fresh] }));
    expect(topic).toMatchObject({ kind: "NEW_PRODUCT", key: "new:M18 FHIW2F12", title: "Νέο: Milwaukee M18 FHIW2F12" });
    expect(topic.score).toBe(40 + 25 + 10);
  });
});

describe("planTopics · categories and keywords", () => {
  const cat = (slug: string, nameEl: string, over: object = {}) => ({
    slug,
    nameEl,
    erpType: "GROUP" as const,
    productCount: 40,
    hasIntro: false,
    ...over,
  });

  it("plans a group with products, no guide and no intro", () => {
    const topics = planTopics(base({ categories: [cat("gantia", "ΓΑΝΤΙΑ")] }));
    expect(topics[0]).toMatchObject({ kind: "CATEGORY", key: "category:gantia", title: "Πώς διαλέγω γαντια Milwaukee" });
    expect(topics[0].payload).toMatchObject({ articleKind: "GUIDE", categorySlug: "gantia" });
  });

  it("skips top-level, small, introduced, catch-all and guide-linked categories", () => {
    const guide = { kind: "GUIDE" as const, title: "Άλλο", keywords: [], entities: [], links: ["/katalogos/linked"] };
    const topics = planTopics(
      base({
        categories: [
          cat("top", "ΕΡΓΑΛΕΙΑ", { erpType: "CATEGORY" }),
          cat("small", "ΜΙΚΡΗ", { productCount: 3 }),
          cat("intro", "ΜΕ ΕΙΣΑΓΩΓΗ", { hasIntro: true }),
          cat("misc", "ΛΟΙΠΑ ΜΗΧΑΝΗΜΑΤΑ"),
          cat("linked", "ΣΥΝΔΕΔΕΜΕΝΗ"),
        ],
        articles: [guide],
      }),
    );
    expect(topics).toEqual([]);
  });

  it("seeds the keyword-map clusters", () => {
    const [topic] = planTopics(base({ seed }));
    expect(topic).toMatchObject({ kind: "KEYWORD", key: "keyword:sfyria", score: 25 });
    expect(topic.payload).toMatchObject({ articleKind: "GUIDE", keyword: "σφυρί", categorySlugs: ["sfyria"] });
  });
});

describe("planTopics · duplicates", () => {
  it("drops a topic whose title or main keyword is ≥ 0.6 similar to an article", () => {
    const byTitle = [{ kind: "GUIDE" as const, title: "Σφυριά", keywords: ["κάτι άλλο"], entities: [], links: [] }];
    const byKeyword = [{ kind: "GUIDE" as const, title: "Εργαλεία χειρός", keywords: ["σφυριά"], entities: [], links: [] }];
    expect(planTopics(base({ seed, articles: byTitle }))).toEqual([]);
    expect(planTopics(base({ seed, articles: byKeyword }))).toEqual([]);
  });

  it("keeps the better of two similar topics", () => {
    const topics = planTopics(
      base({
        categories: [
          { slug: "sfyria", nameEl: "ΣΦΥΡΙΑ", erpType: "GROUP", productCount: 19, hasIntro: false },
        ],
        seed,
      }),
    );
    // «Πώς διαλέγω σφυρια» (score 19.5) against the seed «Σφυριά» (25): one survives.
    expect(topics.map((t) => t.key)).toEqual(["keyword:sfyria"]);
  });
});

describe("mergeQueue", () => {
  const stored = (key: string, over: Partial<StoredTopic> = {}): StoredTopic => ({
    id: `id-${key}`,
    key,
    status: "PENDING",
    pinned: false,
    attempts: 0,
    articleId: null,
    ...over,
  });
  const planned = planTopics(base({ models: [model("M18 FPD3"), model("M18 FID3")] }));

  it("creates new topics and refreshes waiting ones", () => {
    const changes = mergeQueue([stored("model:M18 FPD3", { status: "FAILED", attempts: 1 })], planned);
    expect(changes.create.map((t) => t.key)).toEqual(["model:M18 FID3"]);
    expect(changes.update.map((u) => u.id)).toEqual(["id-model:M18 FPD3"]);
  });

  it("never touches DONE, SKIPPED or pinned rows", () => {
    const changes = mergeQueue(
      [
        stored("model:M18 FPD3", { status: "DONE" }),
        stored("model:M18 FID3", { status: "SKIPPED" }),
        stored("model:M18 GONE", { pinned: true }),
      ],
      planned,
    );
    expect(changes).toEqual({ create: [], update: [], remove: [] });
  });

  it("removes waiting topics that are no longer gaps, unless tried or pinned", () => {
    const changes = mergeQueue(
      [stored("model:OLD"), stored("model:TRIED", { attempts: 1 }), stored("model:PIN", { pinned: true })],
      [],
    );
    expect(changes.remove).toEqual(["id-model:OLD"]);
  });
});

describe("topicOrder", () => {
  it("takes pinned first, then the higher score, then fewer failures", () => {
    const rows = [
      { key: "a", pinned: false, attempts: 0, score: 90 },
      { key: "b", pinned: true, attempts: 2, score: 10 },
      { key: "c", pinned: false, attempts: 1, score: 99 },
      { key: "d", pinned: false, attempts: 0, score: 99 },
    ];
    expect([...rows].sort(topicOrder).map((r) => r.key)).toEqual(["b", "d", "c", "a"]);
  });

  it("lets the writer take only pinned topics or those at the threshold", () => {
    expect(eligibleTopic({ pinned: false, score: 39.9 })).toBe(false);
    expect(eligibleTopic({ pinned: false, score: 40 })).toBe(true);
    expect(eligibleTopic({ pinned: true, score: 5 })).toBe(true);
  });
});
