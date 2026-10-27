import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, lockoutSince } from "@/lib/admin/users";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/admin/users-types";
import {
  RESET_TTL_MINUTES,
  allowedResetOrigins,
  generateResetToken,
  hashResetToken,
  isResetRateLimited,
  isWellFormedResetToken,
  rateLimitWindowStart,
  resetExpiresAt,
  resetLinkOrigin,
  resetTokenState,
} from "@/lib/admin/password-reset-core";
import { mailConfigured } from "@/lib/mail/client";
import { buildAdminResetEmail } from "@/lib/mail/account-emails";
import { deliver } from "@/lib/mail/hdc/deliver";
import { requestFingerprint, stampNow } from "@/lib/mail/request-context";
import { clientAddress } from "@/lib/security/client-ip";
import { siteOrigin, siteOriginConfigured } from "@/lib/seo/urls";

/**
 * «Ξέχασα τον κωδικό» for /admin operators.
 *
 * Same shape as the customer reset in `lib/account/password-reset.ts`, with the
 * stakes of an admin account:
 *
 *   - the reply is identical whether or not the address is an active operator,
 *     and the mail is sent AFTER the response (`after()`), so a known address
 *     does not answer slower than an unknown one;
 *   - only the SHA-256 of the token is stored (see `password-reset-core.ts`);
 *   - 3 requests per email and per IP in 15 minutes, counted from a table that
 *     records every submission, known address or not;
 *   - the link's origin is the request's own only when it is on the allowlist,
 *     never an arbitrary Host header;
 *   - a completed reset ends every open session and clears the lockout.
 */

/** Rows older than this are of no use to the rate limit and are swept. */
const REQUEST_LOG_RETENTION_MS = 24 * 3600_000;

const emailSchema = z.email().max(320);

/**
 * The requester as `security/client-ip.ts` resolves it: `cf-connecting-ip`
 * only from a Cloudflare edge, otherwise Traefik's peer. Not the first
 * `x-forwarded-for` hop, which the client writes itself and which made the
 * per-IP reset limit below trivially evadable.
 */
function clientIp(h: Headers): string | null {
  return clientAddress(h)?.slice(0, 64) ?? null;
}

export type ForgotOutcome = { ok: true } | { ok: false; error: string };

export async function requestAdminPasswordReset(rawEmail: string): Promise<ForgotOutcome> {
  const email = rawEmail.trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) {
    return { ok: false, error: "Συμπληρώστε ένα έγκυρο email." };
  }

  const h = await headers();
  const ip = clientIp(h);
  const now = new Date();
  const since = rateLimitWindowStart(now);

  const [byEmail, byIp] = await Promise.all([
    prisma.adminPasswordResetRequest.count({ where: { email, createdAt: { gte: since } } }),
    ip ? prisma.adminPasswordResetRequest.count({ where: { ipAddress: ip, createdAt: { gte: since } } }) : null,
  ]);

  // Every submission is recorded, allowed or not: a flood keeps itself blocked.
  await prisma.adminPasswordResetRequest.create({ data: { email, ipAddress: ip } });
  await prisma.adminPasswordResetRequest.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - REQUEST_LOG_RETENTION_MS) } },
  });

  if (isResetRateLimited({ byEmail, byIp })) {
    console.warn(`[admin-reset] rate limited (email ${byEmail}, ip ${byIp ?? "?"})`);
    return { ok: true };
  }

  const user = await prisma.adminUser.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, isActive: true },
  });
  if (!user || !user.isActive) return { ok: true };

  const origin = resetLinkOrigin(
    { forwardedProto: h.get("x-forwarded-proto"), forwardedHost: h.get("x-forwarded-host"), host: h.get("host") },
    allowedResetOrigins({
      siteOrigin: siteOrigin(),
      siteConfigured: siteOriginConfigured(),
      isDev: process.env.NODE_ENV === "development",
    }),
  );
  if (!origin) {
    console.error("[admin-reset] no allowlisted origin (NEXT_PUBLIC_SITE_URL unset) — no link sent");
    return { ok: true };
  }

  const { token, tokenHash } = generateResetToken();
  await prisma.$transaction([
    // A new link retires every earlier one that was never used.
    prisma.adminPasswordReset.deleteMany({ where: { adminUserId: user.id, usedAt: null } }),
    prisma.adminPasswordReset.create({
      data: { adminUserId: user.id, tokenHash, expiresAt: resetExpiresAt(now), requestIp: ip },
    }),
  ]);

  const link = `${origin}/admin/reset-password?token=${token}`;
  const fingerprint = await requestFingerprint(h);
  const requestedAt = stampNow(now);

  after(async () => {
    if (!mailConfigured()) {
      console.error("[admin-reset] mail is not configured — reset link not sent");
      return;
    }
    const email = buildAdminResetEmail({
      to: user.email,
      url: link,
      minutes: RESET_TTL_MINUTES,
      requestedAt,
      fingerprint,
    });
    const result = await deliver(email, { to: user.email }, "admin-reset");
    if (!result.ok) console.error(`[admin-reset] send failed: ${result.error}`);
  });

  return { ok: true };
}

type ResolvedToken =
  | { ok: true; id: string; user: { id: string; email: string } }
  | { ok: false };

async function resolveToken(token: string, now: Date): Promise<ResolvedToken> {
  if (!isWellFormedResetToken(token)) return { ok: false };
  const row = await prisma.adminPasswordReset.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: {
      id: true,
      expiresAt: true,
      usedAt: true,
      adminUser: { select: { id: true, email: true, isActive: true } },
    },
  });
  if (resetTokenState(row, now) !== "valid" || !row?.adminUser.isActive) return { ok: false };
  return { ok: true, id: row.id, user: { id: row.adminUser.id, email: row.adminUser.email } };
}

/** For the reset page: is this link still good, and for whom. */
export async function checkAdminResetToken(token: string): Promise<{ email: string } | null> {
  const resolved = await resolveToken(token, new Date());
  return resolved.ok ? { email: resolved.user.email } : null;
}

export type CompleteOutcome =
  | { ok: true }
  | { ok: false; error: "invalid" | "short" | "long" | "mismatch" };

export async function completeAdminPasswordReset(
  token: string,
  password: string,
  confirm: string,
): Promise<CompleteOutcome> {
  if (password.length < PASSWORD_MIN) return { ok: false, error: "short" };
  if (password.length > PASSWORD_MAX) return { ok: false, error: "long" };
  if (password !== confirm) return { ok: false, error: "mismatch" };

  const now = new Date();
  const resolved = await resolveToken(token, now);
  if (!resolved.ok) return { ok: false, error: "invalid" };

  const passwordHash = await hashPassword(password);
  const ip = clientIp(await headers());

  const done = await prisma.$transaction(async (tx) => {
    // Claim the token: of two concurrent submissions only one gets count 1.
    const claimed = await tx.adminPasswordReset.updateMany({
      where: { id: resolved.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;

    await tx.adminUser.update({
      where: { id: resolved.user.id },
      data: { passwordHash, sessionsValidFrom: now },
    });
    await tx.adminPasswordReset.deleteMany({ where: { adminUserId: resolved.user.id, usedAt: null } });
    // A new password is also the answer to a lockout.
    await tx.loginAttempt.deleteMany({
      where: { identifier: resolved.user.email, successful: false, attemptedAt: { gte: lockoutSince() } },
    });
    await tx.adminAuditLog.create({
      data: {
        userId: resolved.user.id,
        action: "user.password_forgot_reset",
        entity: "AdminUser",
        entityId: resolved.user.id,
        diff: { email: resolved.user.email, ip },
      },
    });
    return true;
  });

  return done ? { ok: true } : { ok: false, error: "invalid" };
}
