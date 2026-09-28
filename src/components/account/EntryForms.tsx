"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormError } from "@/components/account/AuthForms";
import { Link } from "@/i18n/navigation";
import {
  acceptInvitation,
  requestAccountLink,
  requestReset,
  submitNewPassword,
} from "@/lib/account/actions";

/**
 * The four forms that begin or end in a mailbox — prove you hold an address,
 * then be let in — in the account.html field and button style.
 *
 * Every message reads the same whether or not the address is known: a form
 * that distinguishes answers "does this person shop here" for anyone who asks.
 */

function Sent({ children }: { children: React.ReactNode }) {
  return (
    <p className="hdc-notice" data-tone="ok" role="status">
      {children}
    </p>
  );
}

/** «ΕΧΩ ΗΔΗ ΠΑΡΑΓΓΕΙΛΕΙ» — email plus an order number, and a link goes out. */
export function ClaimAccountForm({ button = "line" }: { button?: "line" | "red" }) {
  const t = useTranslations("account.Hdc");
  const [state, action, pending] = useActionState(requestAccountLink, {});

  if (state.sent) return <Sent>{t("claim_sent")}</Sent>;

  return (
    <form action={action} className="hdc-auth-form">
      <FormError message={state.error} />
      <Field label={t("f_email")} name="email" type="email" autoComplete="email" placeholder={t("f_email_ph")} required />
      <Field
        label={t("f_order_number")}
        name="orderNumber"
        placeholder="HDC-…"
        required
        help={t("f_order_number_help")}
      />
      <button type="submit" disabled={pending} className={`hdc-btn hdc-btn-${button}`}>
        {pending ? "…" : t("steilte_syndesmo")}
      </button>
    </form>
  );
}

/** «Ξέχασα τον κωδικό μου». */
export function ForgotPasswordForm() {
  const t = useTranslations("account.Hdc");
  const [state, action, pending] = useActionState(requestReset, {});

  if (state.sent) return <Sent>{t("reset_sent")}</Sent>;

  return (
    <form action={action} className="hdc-auth-form">
      <FormError message={state.error} />
      <Field label={t("f_email")} name="email" type="email" autoComplete="email" placeholder={t("f_email_ph")} required />
      <button type="submit" disabled={pending} className="hdc-btn hdc-btn-red">
        {pending ? "…" : t("steilte_syndesmo")}
      </button>
    </form>
  );
}

/** Set a new password from a reset link. */
export function NewPasswordForm({ token }: { token: string }) {
  const t = useTranslations("account.Hdc");
  const [state, action, pending] = useActionState(submitNewPassword, {});

  if (state.done) {
    return (
      <>
        <Sent>{t("password_changed")}</Sent>
        <Link href="/eisodos" className="hdc-btn hdc-btn-red">
          {t("syndesi")}
        </Link>
      </>
    );
  }

  return (
    <form action={action} className="hdc-auth-form">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />
      <Field label={t("f_new_password")} name="password" type="password" autoComplete="new-password" minLength={8} required help={t("f_password_help")} />
      <Field
        label={t("f_repeat")}
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        error={state.fieldErrors?.confirm}
      />
      <button type="submit" disabled={pending} className="hdc-btn hdc-btn-red">
        {pending ? "…" : t("apothikeusi")}
      </button>
    </form>
  );
}

/** Accept a registration invitation: choose a password, and you are in. */
export function AcceptInviteForm({ token, email, name }: { token: string; email: string; name: string }) {
  const t = useTranslations("account.Hdc");
  const [state, action, pending] = useActionState(acceptInvitation, {});

  return (
    <form action={action} className="hdc-auth-form">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />
      {name && <Field label={t("f_name")} name="" defaultValue={name} readOnly />}
      <Field label={t("f_email")} name="" defaultValue={email} readOnly />
      <Field
        label={t("f_password")}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        error={state.fieldErrors?.password}
        help={t("f_password_help")}
      />
      <Field
        label={t("f_repeat")}
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        error={state.fieldErrors?.confirm}
      />
      <button type="submit" disabled={pending} className="hdc-btn hdc-btn-red">
        {pending ? "…" : t("dimiourgia_logariasmou")}
      </button>
    </form>
  );
}
