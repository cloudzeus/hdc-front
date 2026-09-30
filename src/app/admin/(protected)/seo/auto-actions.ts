"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { setSetting } from "@/lib/settings/settings";
import { runState, type RunState } from "@/lib/content-auto/admin";
import { refreshTopicQueue } from "@/lib/content-auto/queue";
import { executeRun, startRun } from "@/lib/content-auto/runner";

/**
 * The actions of the «Αυτόματα άρθρα» tab. Each one checks the capability
 * itself (a server action is a public endpoint): `seo.edit` for every change,
 * `seo.view` to follow a run. Every change is written to the audit log.
 */

async function guard(edit = true) {
  const session = await auth();
  assertCan(session?.user.role, edit ? "seo.edit" : "seo.view");
  return session!.user;
}

type User = Awaited<ReturnType<typeof guard>>;

function audit(user: User, action: string, entity: string, entityId: string, diff: Record<string, unknown>) {
  return prisma.adminAuditLog.create({
    data: { userId: user.id, action, entity, entityId: entityId.slice(0, 64), diff: diff as object },
  });
}

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const idSchema = z.string().min(1).max(64);

const settingsSchema = z.object({
  enabled: z.boolean(),
  notifyEmail: z.union([z.literal(""), z.string().trim().email().max(200)]),
  maxPerWeek: z.number().int().min(1).max(3),
});

export async function saveAutoSettingsAction(input: z.infer<typeof settingsSchema>): Promise<ActionResult> {
  const user = await guard();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.path[0] === "notifyEmail" ? "Μη έγκυρο email." : "Μη έγκυρα στοιχεία." };
  }
  const actor = user.email ?? "admin";
  const { enabled, notifyEmail, maxPerWeek } = parsed.data;
  for (const [key, value] of [
    ["content.auto.enabled", enabled ? "on" : "off"],
    ["content.auto.notifyEmail", notifyEmail.trim()],
    ["content.auto.maxPerWeek", String(maxPerWeek)],
  ] as const) {
    const result = await setSetting(key, value, actor);
    if (!result.ok) return result;
  }
  await audit(user, "seo.auto.settings", "Setting", "content.auto", { enabled, notifyEmail: notifyEmail ? "set" : "empty", maxPerWeek });
  revalidatePath("/admin/seo");
  return { ok: true };
}

export async function refreshQueueAction(): Promise<ActionResult<{ planned: number; created: number; removed: number }>> {
  const user = await guard();
  const report = await refreshTopicQueue();
  await audit(user, "seo.auto.queue.refresh", "ContentTopic", "all", report);
  revalidatePath("/admin/seo");
  return { ok: true, planned: report.planned, created: report.created, removed: report.removed };
}

/** «Αγνόησε», «Πρώτο», «Επαναφορά». */
export async function topicAction(id: string, action: "skip" | "first" | "restore"): Promise<ActionResult> {
  const user = await guard();
  if (!idSchema.safeParse(id).success || !["skip", "first", "restore"].includes(action)) return { ok: false, error: "Μη έγκυρα στοιχεία." };
  const topic = await prisma.contentTopic.findUnique({ where: { id }, select: { id: true, key: true, status: true } });
  if (!topic) return { ok: false, error: "Το θέμα δεν βρέθηκε." };
  if (action === "skip") {
    await prisma.contentTopic.update({ where: { id }, data: { status: "SKIPPED", pinned: false } });
  } else if (action === "first") {
    if (topic.status !== "PENDING" && topic.status !== "FAILED") return { ok: false, error: "Μόνο ένα θέμα που περιμένει ανεβαίνει πρώτο." };
    await prisma.$transaction([
      prisma.contentTopic.updateMany({ where: { pinned: true }, data: { pinned: false } }),
      prisma.contentTopic.update({ where: { id }, data: { pinned: true } }),
    ]);
  } else {
    if (topic.status !== "SKIPPED") return { ok: false, error: "Επαναφέρεται μόνο ένα θέμα που παραλείφθηκε." };
    await prisma.contentTopic.update({ where: { id }, data: { status: "PENDING", attempts: 0 } });
  }
  await audit(user, `seo.auto.topic.${action}`, "ContentTopic", id, { key: topic.key });
  revalidatePath("/admin/seo");
  return { ok: true };
}

/**
 * «Γράψε ένα τώρα»: claims the writer, returns the run at once and works in
 * the background — the browser polls `autoRunStateAction` (Cloudflare cuts a
 * request at 100″; a run takes a few minutes).
 */
export async function startAutoRunAction(mode: "draft" | "publish", topicId?: string | null): Promise<ActionResult<{ runId: string }>> {
  const user = await guard();
  if (mode !== "draft" && mode !== "publish") return { ok: false, error: "Μη έγκυρα στοιχεία." };
  if (topicId != null && !idSchema.safeParse(topicId).success) return { ok: false, error: "Μη έγκυρα στοιχεία." };
  const started = await startRun({
    trigger: mode === "publish" ? "manual-publish" : "manual-draft",
    actor: user.email ?? "admin",
    actorUserId: user.id,
    topicId: topicId ?? null,
  });
  if (!started.ok) return started;
  await audit(user, "seo.auto.run.start", "ContentJobRun", started.runId, { mode, topicId: topicId ?? null });
  // Not awaited: the run outlives this request, and records its own end.
  void executeRun(started.runId, { actorUserId: user.id }).catch((error) =>
    console.error("[content-auto] run", started.runId, error instanceof Error ? error.message : error),
  );
  return { ok: true, runId: started.runId };
}

export async function autoRunStateAction(runId: string): Promise<RunState | null> {
  await guard(false);
  if (!idSchema.safeParse(runId).success) return null;
  return runState(runId);
}
