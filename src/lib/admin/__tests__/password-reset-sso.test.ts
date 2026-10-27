import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * «Ξέχασα τον κωδικό» while HDCtool SSO is on: with ADMIN_SSO=only a password
 * exists only for the emergency list, and an HDCtool-managed account has none.
 */

const h = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  after: vi.fn(),
  resetCreate: vi.fn(async () => ({})),
  resetDeleteMany: vi.fn(async () => ({ count: 0 })),
  resetFindUnique: vi.fn(),
  claim: vi.fn(async () => ({ count: 1 })),
  userUpdate: vi.fn(async () => ({})),
  userUpdateMany: vi.fn(async () => ({ count: 1 })),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3101" }) }));
vi.mock("next/server", () => ({ after: h.after }));
vi.mock("@/lib/admin/users", () => ({
  hashPassword: vi.fn(async () => "$argon2id$new"),
  lockoutSince: () => new Date(0),
}));
vi.mock("@/lib/mail/client", () => ({ mailConfigured: () => true }));
vi.mock("@/lib/mail/account-emails", () => ({ buildAdminResetEmail: vi.fn() }));
vi.mock("@/lib/mail/hdc/deliver", () => ({ deliver: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/mail/request-context", () => ({ requestFingerprint: vi.fn(async () => ({})), stampNow: () => "now" }));
vi.mock("@/lib/seo/urls", () => ({ siteOrigin: () => "https://shop.test", siteOriginConfigured: () => true }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    adminPasswordReset: { updateMany: h.claim, deleteMany: h.resetDeleteMany },
    adminUser: { update: h.userUpdate, updateMany: h.userUpdateMany },
    loginAttempt: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    adminAuditLog: { create: vi.fn(async () => ({})) },
  };
  return {
    prisma: {
      adminPasswordResetRequest: {
        count: vi.fn(async () => 0),
        create: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      adminUser: {
        findUnique: vi.fn(async ({ where }: { where: { email: string } }) => h.users.get(where.email) ?? null),
      },
      adminPasswordReset: {
        create: h.resetCreate,
        deleteMany: h.resetDeleteMany,
        findUnique: h.resetFindUnique,
      },
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[]),
      ),
    },
  };
});

import { completeAdminPasswordReset, requestAdminPasswordReset } from "@/lib/admin/password-reset";
import { generateResetToken } from "@/lib/admin/password-reset-core";

function addUser(email: string, over: Record<string, unknown> = {}) {
  h.users.set(email, { id: `id-${email}`, email, name: null, isActive: true, hdctoolUserId: null, ...over });
}

function ssoOnly() {
  vi.stubEnv("ADMIN_SSO", "only");
  vi.stubEnv("ADMIN_SSO_CLIENT_ID", "milwaukee");
  vi.stubEnv("ADMIN_SSO_ISSUER", "hdctool");
  vi.stubEnv("HDCTOOL_SSO_URL", "https://hdctool.example");
  vi.stubEnv("ADMIN_EMERGENCY_EMAILS", "boss@x.gr");
}

beforeEach(() => {
  vi.clearAllMocks();
  h.users.clear();
  vi.unstubAllEnvs();
  vi.stubEnv("ADMIN_SSO", "off");
});

describe("requestAdminPasswordReset with HDCtool SSO", () => {
  it("only + unlisted operator: the unknown-email answer, and nothing is sent", async () => {
    ssoOnly();
    addUser("a@x.gr");
    const known = await requestAdminPasswordReset("a@x.gr");
    const unknown = await requestAdminPasswordReset("ghost@x.gr");
    expect(known).toEqual(unknown);
    expect(known).toEqual({ ok: true });
    expect(h.resetCreate).not.toHaveBeenCalled();
    expect(h.after).not.toHaveBeenCalled();
  });

  it("only + emergency account: the link is sent", async () => {
    ssoOnly();
    addUser("boss@x.gr");
    expect(await requestAdminPasswordReset("Boss@x.gr")).toEqual({ ok: true });
    expect(h.resetCreate).toHaveBeenCalledTimes(1);
    expect(h.after).toHaveBeenCalledTimes(1);
  });

  it("only but half-configured: no link for a non-emergency address (login would refuse it)", async () => {
    ssoOnly();
    vi.stubEnv("HDCTOOL_SSO_URL", "");
    addUser("a@x.gr");
    expect(await requestAdminPasswordReset("a@x.gr")).toEqual({ ok: true });
    expect(h.resetCreate).not.toHaveBeenCalled();
    expect(h.after).not.toHaveBeenCalled();
  });

  it("both: an unlisted password operator still gets the link", async () => {
    ssoOnly();
    vi.stubEnv("ADMIN_SSO", "both");
    addUser("a@x.gr");
    await requestAdminPasswordReset("a@x.gr");
    expect(h.after).toHaveBeenCalledTimes(1);
  });

  it("an HDCtool-managed account gets nothing, whatever the mode", async () => {
    vi.stubEnv("ADMIN_SSO", "both");
    addUser("m@x.gr", { hdctoolUserId: "h-1" });
    expect(await requestAdminPasswordReset("m@x.gr")).toEqual({ ok: true });
    expect(h.resetCreate).not.toHaveBeenCalled();
    expect(h.after).not.toHaveBeenCalled();
  });
});

describe("completeAdminPasswordReset for an HDCtool-managed account", () => {
  const live = (adminUser: Record<string, unknown>) => ({
    id: "r1",
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    adminUser: { id: "u1", email: "m@x.gr", isActive: true, ...adminUser },
  });

  it("refuses a valid link and writes no password", async () => {
    h.resetFindUnique.mockResolvedValue(live({ hdctoolUserId: "h-1" }));
    const { token } = generateResetToken();
    expect(await completeAdminPasswordReset(token, "a-long-enough-password", "a-long-enough-password")).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(h.userUpdate).not.toHaveBeenCalled();
    expect(h.userUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses when the account was linked to HDCtool after the link was opened", async () => {
    h.resetFindUnique.mockResolvedValue(live({ hdctoolUserId: null }));
    h.userUpdateMany.mockResolvedValueOnce({ count: 0 });
    const { token } = generateResetToken();
    expect(await completeAdminPasswordReset(token, "a-long-enough-password", "a-long-enough-password")).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(h.userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1", hdctoolUserId: null } }),
    );
  });

  it("still completes for a password account", async () => {
    h.resetFindUnique.mockResolvedValue(live({ hdctoolUserId: null }));
    const { token } = generateResetToken();
    expect(await completeAdminPasswordReset(token, "a-long-enough-password", "a-long-enough-password")).toEqual({
      ok: true,
    });
  });
});
