import "server-only";
import { prisma } from "@/lib/prisma";
import { claimSlot, ensureSlot, finishSlot } from "@/lib/cron/claim";
import { getSetting, getSettingNumber } from "@/lib/settings/settings";
import { athensTime, cadence } from "@/lib/content-auto/cadence";
import { backlogCount, refreshTopicQueue } from "@/lib/content-auto/queue";
import { publishedCounts, runNow } from "@/lib/content-auto/runner";

/**
 * The hourly `content` job (src/lib/cron/schedule.ts), one replica at a time:
 *
 * 1. Once a day, the planner refreshes the topic queue (its own slot,
 *    `content:planner`, so a restart does not replan every hour).
 * 2. When `content.auto.enabled` is on, inside weekdays 09:00–19:00 Athens
 *    time, and the cadence says it is time (cadence.ts), one article is
 *    written — and published if every gate passes.
 */

const PLANNER_CHANNEL = "content:planner";
const PLANNER_EVERY_MS = 20 * 60 * 60_000;
const DAY = 86_400_000;

export async function contentTick(now = new Date()): Promise<string> {
  const lines: string[] = [];

  await ensureSlot(PLANNER_CHANNEL);
  if (await claimSlot(PLANNER_CHANNEL, PLANNER_EVERY_MS)) {
    try {
      const r = await refreshTopicQueue(now);
      await finishSlot(PLANNER_CHANNEL, true);
      lines.push(`ουρά: ${r.planned} θέματα (+${r.created}, ~${r.updated}, −${r.removed})`);
    } catch (error) {
      await finishSlot(PLANNER_CHANNEL, false).catch(() => {});
      lines.push(`ουρά: σφάλμα ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const enabled = (await getSetting("content.auto.enabled")) === "on";
  const [backlog, maxPerWeek, published, cronRuns] = await Promise.all([
    backlogCount(),
    getSettingNumber("content.auto.maxPerWeek"),
    // Counted on the articles (source AUTO), not on run rows: a withdrawn one still went out.
    publishedCounts(now),
    prisma.contentJobRun.findMany({
      where: { trigger: "cron", startedAt: { gte: new Date(now.getTime() - DAY) } },
      select: { startedAt: true },
    }),
  ]);
  const today = athensTime(now).date;
  const decision = cadence({
    now,
    enabled,
    backlog,
    maxPerWeek,
    published: published.dates,
    attemptsToday: cronRuns.filter((r) => athensTime(r.startedAt).date === today).length,
  });
  if (!decision.write) {
    lines.push(`δεν γράφει: ${decision.reason}`);
    return lines.join(" · ");
  }

  const result = await runNow({ trigger: "cron" });
  if ("skipped" in result) lines.push(`δεν ξεκίνησε: ${result.skipped}`);
  else {
    lines.push(
      `${result.outcome} «${result.title ?? result.topic}»${result.failedGates.length ? ` (απέτυχαν: ${result.failedGates.join(", ")})` : ""} · ${result.tokens} tokens`,
    );
  }
  return lines.join(" · ");
}
