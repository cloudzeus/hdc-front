import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The «Αυτόματα άρθρα» actions: `seo.edit` for every change, `seo.view` to
 * follow a run, an audit row for each change. Fake session, database, runner.
 */
const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => session.current) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const db = vi.hoisted(() => ({
  audit: vi.fn(async () => ({})),
  topicFind: vi.fn(),
  topicUpdate: vi.fn(async () => ({})),
  topicUpdateMany: vi.fn(async () => ({})),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminAuditLog: { create: db.audit },
    contentTopic: { findUnique: db.topicFind, update: db.topicUpdate, updateMany: db.topicUpdateMany },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));
const settings = vi.hoisted(() => ({ setSetting: vi.fn<(key: string, value: string, actor: string) => Promise<{ ok: boolean }>>(async () => ({ ok: true })) }));
vi.mock("@/lib/settings/settings", () => settings);
const runner = vi.hoisted(() => ({
  startRun: vi.fn(async () => ({ ok: true, runId: "run1" })),
  executeRun: vi.fn(async () => ({})),
}));
vi.mock("@/lib/content-auto/runner", () => runner);
vi.mock("@/lib/content-auto/queue", () => ({ refreshTopicQueue: vi.fn(async () => ({ planned: 3, created: 1, updated: 1, removed: 0 })) }));
vi.mock("@/lib/content-auto/admin", () => ({ runState: vi.fn(async (id: string) => ({ id, finished: false })) }));

import { applyRoleCapabilities } from "@/lib/rbac";
import * as actions from "@/app/admin/(protected)/seo/auto-actions";

const signIn = (role: "ADMIN" | "EDITOR" | "OPS") => (session.current = { user: { id: "u1", email: "ed@hdc.test", role } });

beforeEach(() => {
  vi.clearAllMocks();
  // EDITOR: view only here; ADMIN: everything.
  applyRoleCapabilities({ EDITOR: ["seo.view"], OPS: ["orders"] });
  signIn("ADMIN");
});

describe("capabilities", () => {
  it("refuses every change without seo.edit, and writes nothing", async () => {
    signIn("EDITOR");
    await expect(actions.saveAutoSettingsAction({ enabled: true, notifyEmail: "", maxPerWeek: 3 })).rejects.toThrow(/Forbidden/);
    await expect(actions.topicAction("t1", "skip")).rejects.toThrow(/Forbidden/);
    await expect(actions.startAutoRunAction("draft")).rejects.toThrow(/Forbidden/);
    await expect(actions.refreshQueueAction()).rejects.toThrow(/Forbidden/);
    expect(settings.setSetting).not.toHaveBeenCalled();
    expect(runner.startRun).not.toHaveBeenCalled();
    expect(db.audit).not.toHaveBeenCalled();
  });

  it("lets seo.view follow a run, and nobody else", async () => {
    signIn("EDITOR");
    expect(await actions.autoRunStateAction("run1")).toMatchObject({ id: "run1" });
    signIn("OPS");
    await expect(actions.autoRunStateAction("run1")).rejects.toThrow(/Forbidden/);
  });
});

describe("changes", () => {
  it("saves the three settings and audits without the address itself", async () => {
    expect(await actions.saveAutoSettingsAction({ enabled: true, notifyEmail: "seo@hdc.test", maxPerWeek: 2 })).toEqual({ ok: true });
    expect(settings.setSetting.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ["content.auto.enabled", "on"],
      ["content.auto.notifyEmail", "seo@hdc.test"],
      ["content.auto.maxPerWeek", "2"],
    ]);
    expect(db.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "seo.auto.settings", diff: { enabled: true, notifyEmail: "set", maxPerWeek: 2 } }),
    });
  });

  it("refuses a bad email or a weekly limit over 3", async () => {
    expect(await actions.saveAutoSettingsAction({ enabled: false, notifyEmail: "όχι email", maxPerWeek: 3 })).toMatchObject({ ok: false });
    expect(await actions.saveAutoSettingsAction({ enabled: false, notifyEmail: "", maxPerWeek: 7 })).toMatchObject({ ok: false });
    expect(settings.setSetting).not.toHaveBeenCalled();
  });

  it("«Πρώτο» pins one topic and unpins the rest; «Αγνόησε» skips it", async () => {
    db.topicFind.mockResolvedValue({ id: "t1", key: "model:M18 FPD3", status: "PENDING" });
    expect(await actions.topicAction("t1", "first")).toEqual({ ok: true });
    expect(db.topicUpdateMany).toHaveBeenCalledWith({ where: { pinned: true }, data: { pinned: false } });
    expect(db.topicUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { pinned: true } });
    expect(await actions.topicAction("t1", "skip")).toEqual({ ok: true });
    expect(db.topicUpdate).toHaveBeenLastCalledWith({ where: { id: "t1" }, data: { status: "SKIPPED", pinned: false } });
    expect(db.audit).toHaveBeenCalledTimes(2);
  });

  it("«Γράψε ένα τώρα» starts the run in the background and returns at once", async () => {
    expect(await actions.startAutoRunAction("draft")).toEqual({ ok: true, runId: "run1" });
    expect(runner.startRun).toHaveBeenCalledWith(expect.objectContaining({ trigger: "manual-draft", actor: "ed@hdc.test", actorUserId: "u1" }));
    expect(runner.executeRun).toHaveBeenCalledWith("run1", { actorUserId: "u1" });
    expect(db.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "seo.auto.run.start" }) });
  });
});
