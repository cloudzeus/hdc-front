"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { register, signIn, updateProfile, type AuthState } from "@/lib/account/actions";
import type { AccountUser } from "@/lib/account/contract";
import { Link } from "@/i18n/navigation";

/**
 * Sign in, register and profile (account.html, screen 1) — thin client
 * wrappers around server actions; every rule they express is enforced again
 * server-side.
 *
 * One kind of account: a retail customer. There is no company account type
 * any more — a customer who needs an invoice asks for one at checkout, where
 * the ΑΦΜ fills in the company from the ΑΑΔΕ.
 */

export function SignInForm({ redirectTo }: { redirectTo?: string }) {
  const t = useTranslations("account.Hdc");
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <form action={action} className="hdc-auth-form">
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      <FormError message={state.error} />

      <Field
        label={t("f_email")}
        name="email"
        type="email"
        autoComplete="email"
        placeholder={t("f_email_ph")}
        required
        error={state.fieldErrors?.email}
      />
      <Field
        label={t("f_password")}
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        required
        error={state.fieldErrors?.password}
        aside={
          <Link href="/eisodos/prosvasi">
            <span className="lg">{t("xechasate_ton_kodiko")}</span>
            <span className="sh">{t("xechasate")}</span>
          </Link>
        }
      />

      <button type="submit" disabled={pending} className="hdc-btn hdc-btn-red">
        {pending ? "…" : t("syndesi")}
      </button>
    </form>
  );
}

/** A retail account: name, email, mobile, password, terms. */
export function RegisterForm() {
  const t = useTranslations("account.Hdc");
  const [state, action, pending] = useActionState<AuthState, FormData>(register, {});

  return (
    <form action={action} className="hdc-auth-form">
      <input type="hidden" name="accountType" value="individual" />
      <FormError message={state.error} />

      <div className="hdc-fld-row">
        <Field label={t("f_first_name")} name="firstName" autoComplete="given-name" required error={state.fieldErrors?.firstName} />
        <Field label={t("f_last_name")} name="lastName" autoComplete="family-name" required error={state.fieldErrors?.lastName} />
      </div>
      <div className="hdc-fld-row">
        <Field
          label={t("f_email")}
          name="email"
          type="email"
          autoComplete="email"
          placeholder={t("f_email_ph")}
          required
          error={state.fieldErrors?.email}
        />
        <Field label={t("f_mobile")} name="phone" type="tel" autoComplete="tel" required error={state.fieldErrors?.phone} />
      </div>
      <Field
        label={t("f_password")}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.password}
        help={t("f_password_help")}
      />

      <label className="hdc-check">
        <input type="checkbox" name="terms" />
        <span>
          {t.rich("apodochi_oron", {
            terms: (chunks) => <Link href="/oroi-chrisis">{chunks}</Link>,
            privacy: (chunks) => <Link href="/aporrito">{chunks}</Link>,
          })}
          {state.fieldErrors?.terms && <span className="err">{state.fieldErrors.terms}</span>}
        </span>
      </label>

      <button type="submit" disabled={pending} className="hdc-btn hdc-btn-red">
        {pending ? "…" : t("dimiourgia_logariasmou")}
      </button>
      <p className="alt">
        {t("echete_idi_logariasmo")} <Link href="/eisodos">{t("syndesi_link")}</Link>
      </p>
    </form>
  );
}

export function ProfileForm({ user }: { user: AccountUser }) {
  const t = useTranslations("account.Hdc");
  const [state, action, pending] = useActionState<AuthState, FormData>(updateProfile, {});
  const [saved, setSaved] = useState(false);

  return (
    <form
      action={async (formData) => {
        setSaved(false);
        await action(formData);
        setSaved(true);
      }}
      className="hdc-acc-form"
    >
      <FormError message={state.error} />
      {saved && !state.error && (
        <p className="hdc-notice" data-tone="ok" role="status">
          {t("apothikeftikan")}
        </p>
      )}

      <div className="hdc-fld-row">
        <Field label={t("f_first_name")} name="firstName" defaultValue={user.firstName} required />
        <Field label={t("f_last_name")} name="lastName" defaultValue={user.lastName} required />
      </div>
      <Field label={t("f_mobile")} name="phone" type="tel" defaultValue={user.phone ?? ""} required />
      {/* Email is the login identifier — changing it is a support action, not a
          form field, or a typo locks the customer out of their own account. */}
      <Field label={t("f_email")} name="" defaultValue={user.email} readOnly help={t("allagi_email")} />

      <button type="submit" disabled={pending} className="hdc-btn hdc-btn-ink">
        {pending ? "…" : t("apothikeusi")}
      </button>
    </form>
  );
}

// ── Shared primitives (also used by EntryForms) ─────────────────────────────

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="hdc-notice">
      {message}
    </p>
  );
}

export function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  defaultValue,
  placeholder,
  error,
  help,
  aside,
  readOnly,
  minLength,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  defaultValue?: string;
  placeholder?: string;
  error?: string;
  help?: string;
  /** Right of the label: «Ξεχάσατε τον κωδικό;». */
  aside?: React.ReactNode;
  readOnly?: boolean;
  minLength?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`hdc-fld${className ? ` ${className}` : ""}`} data-error={error ? "" : undefined}>
      <span className="hdc-fld-l">
        <label htmlFor={id}>{label}</label>
        {aside}
      </span>
      <input
        id={id}
        name={name || undefined}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        placeholder={placeholder}
        readOnly={readOnly}
        minLength={minLength}
        aria-invalid={error ? true : undefined}
      />
      {error ? <small className="err">{error}</small> : help ? <small>{help}</small> : null}
    </div>
  );
}
