import type { ContentTopicKind, ContentTopicStatus } from "@/generated/prisma/enums";
import { modelSlug } from "@/lib/milwaukee/model-slug";
import { DUPLICATE_AT, modelMentions, similarity } from "@/lib/content-auto/text";
import type { KeywordSeed } from "@/lib/content-auto/keyword-seed";

/**
 * What to write about next (spec §3): a deterministic gap analysis over the
 * catalogue and the articles that exist. Pure — `queue.ts` reads the database,
 * calls `planTopics`, then `mergeQueue` to know what to write back.
 *
 *   MODEL        a model with ≥ 2 versions that no article mentions
 *                (entities, keywords, or a link to its page or a version)
 *   NEW_PRODUCT  a model with versions new in the ERP in the last 30 days
 *   CATEGORY     a group or subgroup with products, no guide linking it and
 *                no written intro
 *   KEYWORD      the keyword-map clusters left for later
 *
 * Score = demand × gap. A topic whose title or main keyword is ≥ 0.6 similar
 * (Jaccard over words) to an existing article is dropped.
 */

export type PlannerModel = {
  root: string;
  versions: number;
  fuel: boolean;
  oneKey: boolean;
  /** Slugs of the active versions. */
  slugs: string[];
  /** Versions inserted in the ERP in the last 30 days, and the newest date. */
  newVersions: number;
  newestInsertedAt: Date | null;
};

export type PlannerCategory = {
  slug: string;
  nameEl: string;
  erpType: "CATEGORY" | "GROUP" | "SUBGROUP";
  productCount: number;
  hasIntro: boolean;
};

export type PlannerArticle = {
  kind: "ARTICLE" | "GUIDE";
  title: string;
  keywords: string[];
  entities: string[];
  /** Internal paths the body links to. */
  links: string[];
};

export type PlannerInput = {
  now: Date;
  models: PlannerModel[];
  categories: PlannerCategory[];
  articles: PlannerArticle[];
  seed: readonly KeywordSeed[];
};

export type TopicPayload = {
  articleKind: "ARTICLE" | "GUIDE";
  /** The main search phrase the article should target. */
  keyword: string;
  keywords?: string[];
  root?: string;
  categorySlug?: string;
  categorySlugs?: string[];
};

export type PlannedTopic = {
  kind: ContentTopicKind;
  key: string;
  title: string;
  reason: string;
  score: number;
  payload: TopicPayload;
};

/** Topics at or above this score count as backlog for the cadence (spec §7). */
export const SCORE_THRESHOLD = 40;
export const CATEGORY_MIN_PRODUCTS = 6;
/** The queue keeps the best this many; the rest wait for the next day. */
export const QUEUE_MAX = 200;

const DAY = 86_400_000;
/** Catch-all groups make poor guides: «ΛΟΙΠΑ ΜΗΧΑΝΗΜΑΤΑ», «ΑΝΤΑΛΛΑΚΤΙΚΑ». */
const GENERIC_CATEGORY = /^(ΛΟΙΠ|ΔΙΑΦΟΡ|ΑΝΤΑΛΛΑΚΤ|ΑΞΕΣΟΥΑΡ|ΣΕΤ\b|SET\b)/;

/** «ΠΡΟΣΤΑΣΙΑ ΑΝΩ ΑΚΡΩΝ» → «προστασια ανω ακρων»: the ERP writes names without accents. */
const lowerName = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

const PRIORITY_SCORE: Record<KeywordSeed["priority"], number> = { H: 70, M: 50, L: 25 };

export function modelScore(m: Pick<PlannerModel, "versions" | "fuel" | "oneKey">): number {
  return 20 + 8 * Math.min(m.versions, 8) + (m.fuel ? 15 : 0) + (m.oneKey ? 5 : 0);
}

export function categoryScore(productCount: number): number {
  return 10 + Math.min(productCount, 120) / 2;
}

export function newProductScore(m: Pick<PlannerModel, "fuel" | "oneKey">, ageDays: number): number {
  return 40 + Math.max(0, 30 - ageDays) + (m.fuel ? 10 : 0) + (m.oneKey ? 5 : 0);
}

/** The model roots, category paths and product paths the existing articles already cover. */
function coverage(articles: PlannerArticle[]) {
  const roots = new Set<string>();
  const links = new Set<string>();
  const guideLinks = new Set<string>();
  for (const a of articles) {
    for (const text of [...a.entities, ...a.keywords]) for (const m of modelMentions(text)) roots.add(m.root);
    for (const link of a.links) {
      links.add(link);
      if (a.kind === "GUIDE") guideLinks.add(link);
    }
  }
  return { roots, links, guideLinks };
}

function isDuplicate(topic: PlannedTopic, articles: PlannerArticle[]): boolean {
  return articles.some(
    (a) =>
      similarity(topic.title, a.title) >= DUPLICATE_AT ||
      (a.keywords[0] != null && similarity(topic.payload.keyword, a.keywords[0]) >= DUPLICATE_AT),
  );
}

export function planTopics(input: PlannerInput): PlannedTopic[] {
  const covered = coverage(input.articles);
  const out: PlannedTopic[] = [];

  for (const m of input.models) {
    const mentioned =
      covered.roots.has(m.root) ||
      covered.links.has(`/montelo/${modelSlug(m.root)}`) ||
      m.slugs.some((slug) => covered.links.has(`/proion/${slug}`));
    if (mentioned) continue;
    const label = `Milwaukee ${m.root}`;
    if (m.newVersions > 0 && m.newestInsertedAt) {
      const age = Math.floor((input.now.getTime() - m.newestInsertedAt.getTime()) / DAY);
      out.push({
        kind: "NEW_PRODUCT",
        key: `new:${m.root}`,
        title: `Νέο: ${label}`,
        reason: `${m.newVersions === 1 ? "Νέα έκδοση" : "Νέες εκδόσεις"} στον κατάλογο (πριν από ${age} ${age === 1 ? "ημέρα" : "ημέρες"})${m.fuel ? ", FUEL" : ""}${m.oneKey ? ", ONE-KEY" : ""}, χωρίς άρθρο.`,
        score: newProductScore(m, age),
        payload: { articleKind: "ARTICLE", keyword: label.toLowerCase(), root: m.root },
      });
      continue;
    }
    if (m.versions < 2) continue;
    out.push({
      kind: "MODEL",
      key: `model:${m.root}`,
      title: `${label}: εκδόσεις, σύγκριση, για ποιον είναι`,
      reason: `${m.versions} εκδόσεις${m.fuel ? ", FUEL" : ""}${m.oneKey ? ", ONE-KEY" : ""}· κανένα άρθρο δεν το αναφέρει.`,
      score: modelScore(m),
      payload: { articleKind: "ARTICLE", keyword: label.toLowerCase(), root: m.root },
    });
  }

  for (const c of input.categories) {
    if (c.erpType === "CATEGORY" || c.productCount < CATEGORY_MIN_PRODUCTS || c.hasIntro) continue;
    if (GENERIC_CATEGORY.test(c.nameEl.trim())) continue;
    if (covered.guideLinks.has(`/katalogos/${c.slug}`)) continue;
    const name = lowerName(c.nameEl);
    out.push({
      kind: "CATEGORY",
      key: `category:${c.slug}`,
      title: `Πώς διαλέγω ${name} Milwaukee`,
      reason: `Κατηγορία με ${c.productCount} προϊόντα, χωρίς οδηγό και χωρίς γραμμένη εισαγωγή.`,
      score: categoryScore(c.productCount),
      payload: { articleKind: "GUIDE", keyword: name, categorySlug: c.slug },
    });
  }

  for (const s of input.seed) {
    out.push({
      kind: "KEYWORD",
      key: `keyword:${s.id}`,
      title: s.title,
      reason: `Από το keyword map (προτεραιότητα ${s.priority}): ${s.note}`,
      score: PRIORITY_SCORE[s.priority],
      payload: { articleKind: "GUIDE", keyword: s.keywords[0] ?? s.title, keywords: [...s.keywords], categorySlugs: [...s.categorySlugs] },
    });
  }

  // Best first; then drop what an article covers and what a better topic already is.
  out.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const kept: PlannedTopic[] = [];
  for (const topic of out) {
    if (isDuplicate(topic, input.articles)) continue;
    if (kept.some((k) => similarity(k.title, topic.title) >= DUPLICATE_AT || similarity(k.payload.keyword, topic.payload.keyword) >= DUPLICATE_AT)) continue;
    kept.push(topic);
    if (kept.length >= QUEUE_MAX) break;
  }
  return kept;
}

// ── Merging into the stored queue ───────────────────────────────────────────

export type StoredTopic = {
  id: string;
  key: string;
  status: ContentTopicStatus;
  pinned: boolean;
  attempts: number;
  articleId: string | null;
};

export type QueueChanges = {
  create: PlannedTopic[];
  update: Array<{ id: string; title: string; reason: string; score: number; payload: TopicPayload }>;
  /** Waiting topics that are no longer gaps, never tried, not pinned. */
  remove: string[];
};

/**
 * What to write back. DONE and SKIPPED rows are never touched, pinned rows
 * neither (the admin put them there); a waiting row gets the new wording and
 * score but keeps its attempts.
 */
export function mergeQueue(stored: StoredTopic[], planned: PlannedTopic[]): QueueChanges {
  const byKey = new Map(stored.map((s) => [s.key, s]));
  const plannedKeys = new Set(planned.map((p) => p.key));
  const changes: QueueChanges = { create: [], update: [], remove: [] };
  for (const topic of planned) {
    const row = byKey.get(topic.key);
    if (!row) changes.create.push(topic);
    else if ((row.status === "PENDING" || row.status === "FAILED") && !row.pinned) {
      changes.update.push({ id: row.id, title: topic.title, reason: topic.reason, score: topic.score, payload: topic.payload });
    }
  }
  for (const row of stored) {
    if (plannedKeys.has(row.key) || row.pinned || row.status !== "PENDING" || row.attempts > 0 || row.articleId) continue;
    changes.remove.push(row.id);
  }
  return changes;
}

/** The order the writer takes topics in: pinned, fewer failures, higher score. */
export function topicOrder<T extends { pinned: boolean; attempts: number; score: number; key: string }>(a: T, b: T): number {
  return Number(b.pinned) - Number(a.pinned) || a.attempts - b.attempts || b.score - a.score || a.key.localeCompare(b.key);
}

