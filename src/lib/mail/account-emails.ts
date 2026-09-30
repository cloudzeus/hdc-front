import "server-only";
import type { Locale } from "@/i18n/routing";
import { renderEmail } from "@/lib/mail/hdc/render";
import { t } from "@/lib/mail/hdc/strings";
import { deliver, type DeliverOutcome } from "@/lib/mail/hdc/deliver";
import { requestLocale } from "@/lib/mail/hdc/locale";
import { stampNow, type RequestFingerprint } from "@/lib/mail/request-context";

/**
 * The emails of an account's life, and the newsletter double opt-in: welcome,
 * email verification (and its «claim your orders» form), password reset,
 * password changed, and the admin password reset.
 *
 * Each has a `build…` (what the admin preview shows) and a `send…` (what the
 * event calls). None blocks its event: `deliver` logs and returns instead of
 * throwing, so an account that was created stays created with Mailgun down.
 *
 * In the language of the page that asked (`requestLocale`), except the admin
 * reset, which is Greek like the admin.
 */

type Recipient = { firstName?: string | null; lastName?: string | null; email: string };
type Options = { locale?: Locale; assetOrigin?: string };

async function localeOf(options: Options): Promise<Locale> {
  return options.locale ?? (await requestLocale());
}

/* ── Welcome ─────────────────────────────────────────────────────────────── */

export async function buildWelcomeEmail(to: Recipient, options: Options = {}) {
  const locale = await localeOf(options);
  return renderEmail({
    template: "account-welcome",
    locale,
    kind: "account",
    subject: t(locale, "welcome.subject"),
    preheader: t(locale, "welcome.pre"),
    topline: { left: t(locale, "welcome.topline"), right: to.email },
    assetOrigin: options.assetOrigin,
    data: {},
  });
}

/** «Your account is ready» — after sign-up. A statement, not a «Welcome!». */
export async function sendWelcomeEmail(to: Recipient): Promise<DeliverOutcome> {
  try {
    return deliver(await buildWelcomeEmail(to), { to: to.email }, `welcome ${to.email}`);
  } catch (error) {
    console.error("[mail] welcome:", error);
    return { ok: false, error: String(error) };
  }
}

/* ── Password changed ───────────────────────────────────────────────────── */

export async function buildPasswordChangedEmail(
  to: Recipient,
  fingerprint: RequestFingerprint,
  options: Options = {},
) {
  const locale = await localeOf(options);
  return renderEmail({
    template: "account-password-changed",
    locale,
    kind: "account",
    subject: t(locale, "changed.subject"),
    preheader: t(locale, "changed.pre"),
    topline: { left: t(locale, "changed.topline"), right: to.email },
    assetOrigin: options.assetOrigin,
    data: {
      change: {
        rows: [
          { label: t(locale, "changed.when"), value: stampNow(), strong: true },
          { label: t(locale, "reset.device"), value: fingerprint.device },
          { label: t(locale, "reset.ip"), value: fingerprint.ip },
        ],
      },
    },
  });
}

/**
 * «Your password was changed» — a security notice, sent ALWAYS: its point is
 * to reach the person who did NOT make the change. No «lock account» button:
 * there is no such page, and a button that does not lock is worse than none.
 */
export async function sendPasswordChangedEmail(to: Recipient, fingerprint: RequestFingerprint) {
  try {
    return deliver(await buildPasswordChangedEmail(to, fingerprint), { to: to.email }, `password-changed ${to.email}`);
  } catch (error) {
    console.error("[mail] password-changed:", error);
    return { ok: false as const, error: String(error) };
  }
}

/* ── Email verification / claim ─────────────────────────────────────────── */

export type VerifyInput = {
  to: Recipient;
  url: string;
  hours: number;
  /** `claim`: a guest buyer asking for an account on an order — the button sets a password. */
  mode: "verify" | "claim";
  orderNumber?: string;
};

export async function buildVerifyEmail(input: VerifyInput, options: Options = {}) {
  const locale = await localeOf(options);
  const claim = input.mode === "claim";
  return renderEmail({
    template: "account-verify",
    locale,
    kind: "account",
    subject: t(locale, claim ? "claim.subject" : "verify.subject"),
    preheader: t(locale, claim ? "claim.pre" : "verify.pre", { hours: input.hours }),
    topline: { left: t(locale, "verify.topline"), right: input.to.email },
    assetOrigin: options.assetOrigin,
    data: {
      verify: {
        url: input.url,
        hours: input.hours,
        eyebrowKey: claim ? "claim.eyebrow" : "verify.eyebrow",
        titleKey: claim ? "claim.title" : "verify.title",
        ctaKey: claim ? "claim.cta" : "verify.cta",
        ignoreKey: claim ? "claim.ignore" : "verify.ignore",
        lead: claim
          ? t(locale, "claim.lead", { number: input.orderNumber || "—" })
          : t(locale, "verify.lead"),
      },
    },
  });
}

export async function sendVerifyEmail(input: VerifyInput, options: Options = {}): Promise<DeliverOutcome> {
  try {
    return deliver(await buildVerifyEmail(input, options), { to: input.to.email }, `verify ${input.to.email}`);
  } catch (error) {
    console.error("[mail] verify:", error);
    return { ok: false, error: String(error) };
  }
}

/* ── Customer password reset ────────────────────────────────────────────── */

export type ResetInput = {
  to: Recipient;
  url: string;
  hours: number;
  requestedAt: string;
  fingerprint: RequestFingerprint;
};

export async function buildPasswordResetEmail(input: ResetInput, options: Options = {}) {
  const locale = await localeOf(options);
  const time = t(locale, "time.hours", { n: input.hours });
  return renderEmail({
    template: "account-password-reset",
    locale,
    kind: "account",
    subject: t(locale, "reset.subject"),
    preheader: t(locale, "reset.pre", { time }),
    topline: { left: t(locale, "reset.topline"), right: input.to.email },
    assetOrigin: options.assetOrigin,
    data: {
      reset: {
        url: input.url,
        expires_in: time,
        /* Who asked, from where: the only facts that let someone see it was not them. */
        rows: [
          { label: t(locale, "reset.requested"), value: input.requestedAt, strong: true },
          { label: t(locale, "reset.device"), value: input.fingerprint.device },
          { label: t(locale, "reset.ip"), value: input.fingerprint.ip },
        ],
      },
    },
  });
}

export async function sendPasswordResetEmail(input: ResetInput, options: Options = {}): Promise<DeliverOutcome> {
  try {
    return deliver(await buildPasswordResetEmail(input, options), { to: input.to.email }, `password-reset ${input.to.email}`);
  } catch (error) {
    console.error("[mail] password-reset:", error);
    return { ok: false, error: String(error) };
  }
}

/* ── Newsletter double opt-in ───────────────────────────────────────────── */

export async function buildNewsletterConfirmEmail(
  input: { to: string; url: string; hours: number },
  options: Options = {},
) {
  const locale = await localeOf(options);
  return renderEmail({
    template: "newsletter-confirm",
    locale,
    kind: "subscribe",
    subject: t(locale, "subscribe.subject"),
    preheader: t(locale, "subscribe.pre"),
    topline: { left: t(locale, "subscribe.topline"), right: input.to },
    assetOrigin: options.assetOrigin,
    data: {
      subscribe: {
        url: input.url,
        hours: input.hours,
        what: [t(locale, "subscribe.what_offers"), t(locale, "subscribe.what_new"), t(locale, "subscribe.what_news")],
      },
    },
  });
}

/* ── Admin password reset (Greek) ───────────────────────────────────────── */

export type AdminResetInput = {
  to: string;
  url: string;
  minutes: number;
  requestedAt: string;
  fingerprint: RequestFingerprint;
};

export function buildAdminResetEmail(input: AdminResetInput, options: { assetOrigin?: string } = {}) {
  return renderEmail({
    template: "admin-password-reset",
    locale: "el",
    kind: "admin",
    subject: t("el", "admin.subject"),
    preheader: t("el", "admin.pre", { minutes: input.minutes }),
    topline: { left: t("el", "admin.eyebrow"), right: input.to },
    assetOrigin: options.assetOrigin,
    data: {
      reset: {
        url: input.url,
        email: input.to,
        minutes: input.minutes,
        rows: [
          { label: t("el", "reset.requested"), value: input.requestedAt, strong: true },
          { label: t("el", "reset.device"), value: input.fingerprint.device },
          { label: t("el", "reset.ip"), value: input.fingerprint.ip },
        ],
      },
    },
  });
}
