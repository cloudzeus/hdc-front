"use server";

import { headers } from "next/headers";
import { auth } from "@/auth";
import { assertCan, can } from "@/lib/rbac";
import { routing, type Locale } from "@/i18n/routing";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { mailAssetOrigin } from "@/lib/mail/hdc/render";
import { previewEmail, templateEntry } from "@/lib/mail/hdc/catalog";
import { requestFingerprint } from "@/lib/mail/request-context";

export type SendTestResult = { ok: true; to: string } | { ok: false; error: string };

/**
 * «Αποστολή δοκιμαστικού σε εμένα»: the preview, sent to the signed-in admin
 * and to nobody else — there is no address field, so a test cannot reach a
 * customer. The subject says [ΔΟΚΙΜΗ].
 *
 * Pictures and the logo load from the public site, as in a real send (the
 * recipient's mail client cannot reach a development server).
 */
export async function sendTemplateTestAction(input: {
  id: string;
  locale: string;
  variant?: string;
  order?: string;
}): Promise<SendTestResult> {
  const session = await auth();
  assertCan(session?.user.role, "engagement");
  const to = session?.user.email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
    return { ok: false, error: "Ο λογαριασμός σας δεν έχει έγκυρο email." };
  }

  const entry = templateEntry(input.id);
  if (!entry) return { ok: false, error: "Άγνωστο πρότυπο." };
  if (!mailConfigured()) return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };

  const locale: Locale = routing.locales.includes(input.locale as Locale) ? (input.locale as Locale) : "el";
  const preview = await previewEmail(input.id, {
    locale,
    variant: input.variant,
    orderNumber: input.order,
    realOrders: can(session?.user.role, "orders"),
    assetOrigin: mailAssetOrigin(),
    admin: { email: to, name: session?.user.name },
    fingerprint: await requestFingerprint(await headers()),
  });
  if (!preview.ok) return preview;

  const result = await sendMail({
    to,
    subject: `[ΔΟΚΙΜΗ] ${preview.email.subject}`,
    html: preview.email.html,
    text: preview.email.text,
  });
  return result.ok ? { ok: true, to } : { ok: false, error: result.error };
}
