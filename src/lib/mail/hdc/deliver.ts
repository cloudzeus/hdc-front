import "server-only";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import type { RenderedEmail } from "@/lib/mail/hdc/render";

export type DeliverOutcome = { ok: true; id: string } | { ok: false; error: string };

/**
 * Hand a rendered email to Mailgun. Never throws.
 *
 * Whatever caused the email has already happened — the money moved, the parcel
 * left — and a slow mail server must not undo it. A failure is logged with the
 * template and the order or address it was for, and returned.
 */
export async function deliver(
  email: RenderedEmail,
  envelope: { to: string; replyTo?: string; cc?: string; bcc?: string },
  context: string,
): Promise<DeliverOutcome> {
  if (!mailConfigured()) return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };
  try {
    const result = await sendMail({
      to: envelope.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: envelope.replyTo ?? process.env.MAIL_REPLY_TO,
      cc: envelope.cc,
      bcc: envelope.bcc,
    });
    if (!result.ok) {
      console.error(`[mail] ${context}: ${result.error}`);
      return { ok: false, error: result.error };
    }
    return { ok: true, id: result.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mail] ${context}: ${message}`);
    return { ok: false, error: message };
  }
}

/** Render, then deliver; a template error is caught like a delivery error. */
export async function renderAndDeliver(
  build: () => Promise<{ to: string; email: RenderedEmail; replyTo?: string; cc?: string; bcc?: string } | null>,
  context: string,
  missing = "Δεν βρέθηκε.",
): Promise<DeliverOutcome> {
  if (!mailConfigured()) return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };
  try {
    const built = await build();
    if (!built) return { ok: false, error: missing };
    return deliver(built.email, built, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mail] ${context}: ${message}`);
    return { ok: false, error: message };
  }
}
