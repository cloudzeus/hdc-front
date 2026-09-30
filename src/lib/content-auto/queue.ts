import "server-only";
import { prisma } from "@/lib/prisma";
import { parseModel } from "@/lib/milwaukee/model";
import { internalLinks } from "@/lib/seo/seo-checks";
import { stringsFromJson } from "@/lib/seo/seo-merge";
import { KEYWORD_SEED } from "@/lib/content-auto/keyword-seed";
import {
  SCORE_THRESHOLD,
  mergeQueue,
  planTopics,
  type PlannerArticle,
  type PlannerCategory,
  type PlannerInput,
  type PlannerModel,
} from "@/lib/content-auto/planner";

/**
 * The topic queue in the database: read the catalogue and the articles, plan
 * (planner.ts, pure), write the changes back. Once a day from the cron, and on
 * demand from the admin («Ανανέωση ουράς»).
 */

const DAY = 86_400_000;
const NEW_WITHIN_DAYS = 30;

export async function loadPlannerInput(now = new Date()): Promise<PlannerInput> {
  const since = new Date(now.getTime() - NEW_WITHIN_DAYS * DAY);
  const [products, categories, intros, articles] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, platform: { not: null } },
      select: { name: true, slug: true, modelRoot: true, isFuel: true, isOneKey: true, erpInsertedAt: true },
    }),
    prisma.category.findMany({
      where: { productCount: { gt: 0 } },
      select: { slug: true, nameEl: true, erpType: true, productCount: true },
    }),
    prisma.seoOverride.findMany({ where: { targetType: "CATEGORY", intro: { not: null } }, select: { targetKey: true } }),
    prisma.contentArticle.findMany({ select: { kind: true, title: true, keywords: true, entities: true, body: true } }),
  ]);

  const models = new Map<string, PlannerModel>();
  for (const p of products) {
    const parsed = parseModel(p.name);
    const root = p.modelRoot ?? parsed?.root;
    if (!root) continue;
    const m = models.get(root) ?? {
      root,
      versions: 0,
      fuel: false,
      oneKey: false,
      slugs: [],
      newVersions: 0,
      newestInsertedAt: null,
    };
    m.versions++;
    m.fuel ||= p.isFuel || parsed?.fuel === true;
    m.oneKey ||= p.isOneKey || parsed?.oneKey === true;
    m.slugs.push(p.slug);
    if (p.erpInsertedAt && p.erpInsertedAt >= since) {
      m.newVersions++;
      if (!m.newestInsertedAt || p.erpInsertedAt > m.newestInsertedAt) m.newestInsertedAt = p.erpInsertedAt;
    }
    models.set(root, m);
  }

  const withIntro = new Set(intros.map((i) => i.targetKey));
  return {
    now,
    models: [...models.values()],
    categories: categories.map(
      (c): PlannerCategory => ({ slug: c.slug, nameEl: c.nameEl, erpType: c.erpType, productCount: c.productCount, hasIntro: withIntro.has(c.slug) }),
    ),
    articles: articles.map(
      (a): PlannerArticle => ({
        kind: a.kind,
        title: a.title,
        keywords: stringsFromJson(a.keywords),
        entities: stringsFromJson(a.entities),
        links: internalLinks(a.body),
      }),
    ),
    seed: KEYWORD_SEED,
  };
}

export type RefreshReport = { planned: number; created: number; updated: number; removed: number };

export async function refreshTopicQueue(now = new Date()): Promise<RefreshReport> {
  const planned = planTopics(await loadPlannerInput(now));
  const stored = await prisma.contentTopic.findMany({
    select: { id: true, key: true, status: true, pinned: true, attempts: true, articleId: true },
  });
  const changes = mergeQueue(stored, planned);

  for (const t of changes.create) {
    await prisma.contentTopic.upsert({
      where: { key: t.key },
      create: { kind: t.kind, key: t.key, title: t.title, reason: t.reason, score: t.score, payload: t.payload },
      update: {},
    });
  }
  for (const u of changes.update) {
    await prisma.contentTopic.update({
      where: { id: u.id },
      data: { title: u.title, reason: u.reason, score: u.score, payload: u.payload },
    });
  }
  if (changes.remove.length) {
    await prisma.contentTopic.deleteMany({ where: { id: { in: changes.remove }, status: "PENDING", pinned: false, attempts: 0 } });
  }
  return { planned: planned.length, created: changes.create.length, updated: changes.update.length, removed: changes.remove.length };
}

/** Waiting topics at or above the threshold: what the cadence reads (spec §7). */
export function backlogCount(): Promise<number> {
  return prisma.contentTopic.count({
    where: { status: { in: ["PENDING", "FAILED"] }, score: { gte: SCORE_THRESHOLD } },
  });
}
