import { createHash, randomBytes } from "node:crypto";

/**
 * The pure half of the admin «Ξέχασα τον κωδικό» flow: tokens, expiry, the
 * rate-limit decision and which origin a reset link may point at. No database,
 * no request — the server half in `password-reset.ts` feeds it facts.
 *
 * ── Only the hash is stored ─────────────────────────────────────────────────
 *
 * The token is a bearer credential for an admin account. The database keeps
 * its SHA-256, so a read of the table (a backup, a leaked dump) yields nothing
 * that can be typed into the reset page. SHA-256 and not argon2: the input is
 * 256 random bits, there is nothing to brute-force, and the lookup must be an
 * indexed equality match.
 */

export const RESET_TTL_MINUTES = 30;
export const RATE_LIMIT_MAX = 3;
export const RATE_LIMIT_WINDOW_MINUTES = 15;

/** 32 bytes → 43 base64url characters, no padding. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

/** Cheap shape check before any database work. */
export function isWellFormedResetToken(value: string): boolean {
  return TOKEN_SHAPE.test(value);
}

export function resetExpiresAt(now: Date): Date {
  return new Date(now.getTime() + RESET_TTL_MINUTES * 60_000);
}

export type ResetTokenState = "valid" | "missing" | "expired" | "used";

export function resetTokenState(
  row: { expiresAt: Date; usedAt: Date | null } | null,
  now: Date,
): ResetTokenState {
  if (!row) return "missing";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

export function rateLimitWindowStart(now: Date): Date {
  return new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60_000);
}

/**
 * Requests already recorded inside the window, per email and per IP. An
 * unknown IP (`null`) is not a bucket: lumping every header-less request into
 * one would let a single noisy client lock everyone else out.
 */
export function isResetRateLimited(counts: { byEmail: number; byIp: number | null }): boolean {
  return counts.byEmail >= RATE_LIMIT_MAX || (counts.byIp !== null && counts.byIp >= RATE_LIMIT_MAX);
}

export const DEV_RESET_ORIGIN = "http://localhost:3101";

/**
 * Where a reset link may point. The configured public address — and only when
 * it really was configured, since the defaulted one is localhost — plus the
 * dev server in development.
 */
export function allowedResetOrigins(input: {
  siteOrigin: string;
  siteConfigured: boolean;
  isDev: boolean;
}): string[] {
  const list: string[] = [];
  if (input.siteConfigured) list.push(input.siteOrigin);
  if (input.isDev && !list.includes(DEV_RESET_ORIGIN)) list.push(DEV_RESET_ORIGIN);
  return list;
}

function firstOf(value: string | null | undefined): string {
  return (value ?? "").split(",")[0]?.trim() ?? "";
}

/**
 * The origin the request arrived on, if it is one we own; otherwise the first
 * allowlisted origin; `null` when there is none.
 *
 * The Host header is whatever the client sent. Building a link from it unchecked
 * would let anyone request a reset for the admin with `Host: evil.example` and
 * have OUR mail carry a token to THEIR server. So the candidate is only ever
 * compared for exact equality against the allowlist — never used on its own.
 */
export function resetLinkOrigin(
  request: { forwardedProto?: string | null; forwardedHost?: string | null; host?: string | null },
  allowlist: string[],
): string | null {
  const host = (firstOf(request.forwardedHost) || firstOf(request.host)).toLowerCase();
  const proto =
    firstOf(request.forwardedProto).toLowerCase() || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");

  if (host && (proto === "http" || proto === "https")) {
    const candidate = `${proto}://${host}`;
    const match = allowlist.find((origin) => origin.toLowerCase() === candidate);
    if (match) return match;
  }
  return allowlist[0] ?? null;
}
