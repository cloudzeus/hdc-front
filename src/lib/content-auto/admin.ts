import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting, getSettingNumber } from "@/lib/settings/settings";
import { cadence, weeklyTarget } from "@/lib/content-auto/cadence";
import { GATE_LABELS, type GateId } from "@/lib/content-auto/gates";
import { SCORE_THRESHOLD } from "@/lib/content-auto/planner";
import { backlogCount } from "@/lib/content-auto/queue";

/**
 * What the «Αυτόματα άρθρα» tab of /admin/seo shows: the settings, where the
 * cadence stands, the topic queue and the run history. Plain data for a
 * client component — dates as ISO strings.
 */

export type AutoSettings = { enabled: boolean; notifyEmail: string; maxPerWeek: number };

export type TopicRow = {
  id: string;
  kind: string;
  key: string;
  title: string;
  reason: string;
  score: number;
  status: string;
  pinned: boolean;
  attempts: number;
  articleId: string | null;
};

export type RunRow = {
  id: string;
  trigger: string;
  actor: string | null;
  startedAt: string;
  finishedAt: string | null;
  seconds: number | null;
  outcome: string | null;
  failedGates: string[];
  tokens: number;
  error: string | null;
  topic: string | null;
  article: { id: string; title: string; slug: string; kind: string; status: string } | null;
};

export type AutoOverview = {
  settings: AutoSettings;
  status: { backlog: number; threshold: number; target: number; publishedThisWeek: number; next: string };
  topics: TopicRow[];
  skipped: TopicRow[];
  runs: RunRow[];
  running: string | null;
};

const DAY = 86_400_000;

export const gateLabel = (id: string) => GATE_LABELS[id as GateId] ?? id;

const topicRow = (t: {
  id: string;
  kind: string;
  key: string;
  title: string;
  reason: string;
  score: number;
  status: string;
  pinned: boolean;
  attempts: number;
  articleId: string | null;
}): TopicRow => ({ ...t, score: Math.round(t.score * 10) / 10 });

export async function autoOverview(now = new Date()): Promise<AutoOverview> {
  const [enabled, notifyEmail, maxPerWeek, backlog, waiting, skipped, runs, published] = await Promise.all([
    getSetting("content.auto.enabled"),
    getSetting("content.auto.notifyEmail"),
    getSettingNumber("content.auto.maxPerWeek"),
    backlogCount(),
    prisma.contentTopic.findMany({
      where: { status: { in: ["PENDING", "FAILED"] } },
      orderBy: [{ pinned: "desc" }, { attempts: "asc" }, { score: "desc" }, { key: "asc" }],
      take: 60,
    }),
    prisma.contentTopic.findMany({ where: { status: "SKIPPED" }, orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.contentJobRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 30,
      include: {
        topic: { select: { title: true } },
        article: { select: { id: true, title: true, slug: true, kind: true, status: true } },
      },
    }),
    prisma.contentJobRun.findMany({
      where: { outcome: "PUBLISHED", finishedAt: { gte: new Date(now.getTime() - 8 * DAY) } },
      select: { finishedAt: true },
    }),
  ]);

  const settings: AutoSettings = {
    enabled: enabled === "on",
    notifyEmail: notifyEmail ?? "",
    maxPerWeek: Math.min(3, Math.max(1, Math.floor(maxPerWeek ?? 3))),
  };
  const dates = published.map((r) => r.finishedAt!).filter(Boolean);
  const decision = cadence({ now, enabled: settings.enabled, backlog, maxPerWeek: settings.maxPerWeek, published: dates, attemptsToday: 0 });

  return {
    settings,
    status: {
      backlog,
      threshold: SCORE_THRESHOLD,
      target: weeklyTarget(backlog, settings.maxPerWeek),
      publishedThisWeek: dates.filter((d) => now.getTime() - d.getTime() < 7 * DAY).length,
      next: decision.write ? "στην επόμενη ωριαία εκτέλεση" : decision.reason,
    },
    topics: waiting.map(topicRow),
    skipped: skipped.map(topicRow),
    runs: runs.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      actor: r.actor,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      seconds: r.finishedAt ? Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000) : null,
      outcome: r.outcome,
      failedGates: Array.isArray(r.failedGates) ? (r.failedGates as string[]) : [],
      tokens: r.tokens,
      error: r.error,
      topic: r.topic?.title ?? null,
      article: r.article,
    })),
    running: runs.find((r) => r.finishedAt == null)?.id ?? null,
  };
}

export type RunState = {
  id: string;
  finished: boolean;
  outcome: string | null;
  failedGates: string[];
  tokens: number;
  error: string | null;
  seconds: number;
  article: { id: string; title: string; slug: string; kind: string; status: string } | null;
};

export async function runState(id: string): Promise<RunState | null> {
  const r = await prisma.contentJobRun.findUnique({
    where: { id },
    include: { article: { select: { id: true, title: true, slug: true, kind: true, status: true } } },
  });
  if (!r) return null;
  return {
    id: r.id,
    finished: r.finishedAt != null,
    outcome: r.outcome,
    failedGates: Array.isArray(r.failedGates) ? (r.failedGates as string[]) : [],
    tokens: r.tokens,
    error: r.error,
    seconds: Math.round(((r.finishedAt ?? new Date()).getTime() - r.startedAt.getTime()) / 1000),
    article: r.article,
  };
}
