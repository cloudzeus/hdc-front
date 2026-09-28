"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { PRIMARY_PHONE } from "@/config/shop";
import { submitContact, type ContactState } from "@/lib/contact/actions";
import { upGreek } from "@/lib/greek";

/**
 * Topic-driven contact form, in the HDC style (content.css `.hdc-form`).
 *
 * The fields change with the topic: a technical question needs the job
 * described, a quote needs quantity and company, an order query needs the
 * order number. Asking everyone for all of it is how a contact form gets
 * abandoned. The extra field appears when the topic is chosen, not before.
 *
 * The HDC has no partner programme, so the Kolleris "partnership" topic is not
 * offered here (the server action still accepts it, harmlessly).
 */

/** The reasons somebody writes in; the words live in the message files. */
const TOPICS = [
  { value: "technical" },
  { value: "quote" },
  { value: "order" },
  { value: "other" },
] as const;

export function ContactForm({
  locale,
  pagePath,
  defaultSubject,
  defaultMessage,
}: {
  locale: string;
  pagePath?: string;
  /** Pre-filled subject — «Ερώτηση για το προϊόν …» from a product page. */
  defaultSubject?: string;
  /** Pre-filled message — the query, from a search that found nothing. */
  defaultMessage?: string;
}) {
  const t = useTranslations("contact.ContactForm");
  const [state, action, pending] = useActionState<ContactState, FormData>(submitContact, {});
  const [topic, setTopic] = useState<(typeof TOPICS)[number]["value"]>("technical");

  if (state.ok) {
    return (
      <div className="hdc-form-done" role="status">
        <h3 className="hdc-disp">{upGreek(t("to_lavame"))}</h3>
        <p>
          {t("apantame_synithos_tin_idia_ergasimi")}{" "}
          <a href={`tel:${PRIMARY_PHONE.e164}`}>{PRIMARY_PHONE.display}</a>.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="hdc-form">
      <input type="hidden" name="locale" value={locale} />
      {pagePath && <input type="hidden" name="pagePath" value={pagePath} />}

      {/* Honeypot: off-screen, not `display:none`, so a bot's autofill still
          finds it while a screen reader is told to skip it. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">{t("min_symplirosete")}</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.error && (
        <p role="alert" className="hdc-form-alert">
          {state.error}
        </p>
      )}

      <fieldset>
        <legend className="hdc-form-label">{upGreek(t("thema"))}</legend>
        <div className="hdc-form-topics">
          {TOPICS.map((option) => (
            <label
              key={option.value}
              className={`hdc-form-topic${topic === option.value ? " is-on" : ""}`}
            >
              <input
                type="radio"
                name="topic"
                value={option.value}
                checked={topic === option.value}
                onChange={() => setTopic(option.value)}
                className="sr-only"
              />
              {upGreek(t(`topic_${option.value}_label`))}
            </label>
          ))}
        </div>
        {topic !== "other" && <span className="hdc-form-help">{t(`topic_${topic}_hint`)}</span>}
      </fieldset>

      <div className="hdc-form-row">
        <Field label={t("onomateponymo")} name="name" autoComplete="name" required error={state.fieldErrors?.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
        <Field label={t("tilefono")} name="phone" type="tel" autoComplete="tel" help={t("gia_na_sas_paroyme_an")} />
        {topic === "order" ? (
          <Field
            label={t("arithmos_paraggelias")}
            name="orderRef"
            placeholder={t("p_ch_kol_20260731_0007")}
            error={state.fieldErrors?.orderRef}
          />
        ) : (
          <Field label={t("etaireia")} name="company" autoComplete="organization" error={state.fieldErrors?.company} />
        )}
      </div>

      <Field
        label={t("thema_minymatos")}
        name="subject"
        required
        defaultValue={defaultSubject}
        error={state.fieldErrors?.subject}
      />

      <label>
        <span className="hdc-form-label">
          {upGreek(t("minyma"))} <i>*</i>
        </span>
        <textarea
          name="message"
          rows={6}
          required
          defaultValue={defaultMessage}
          placeholder={t(`topic_${topic}_placeholder`)}
          aria-invalid={state.fieldErrors?.message ? true : undefined}
          className="hdc-form-input"
        />
        {state.fieldErrors?.message && <span className="hdc-form-err">{state.fieldErrors.message}</span>}
      </label>

      <button type="submit" disabled={pending} className="hdc-btn hdc-btn-red hdc-btn-lg">
        {pending ? "…" : upGreek(t("apostoli"))}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  placeholder,
  error,
  help,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  error?: string;
  help?: string;
}) {
  return (
    <label>
      <span className="hdc-form-label">
        {upGreek(label)}
        {required && <i> *</i>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        className="hdc-form-input"
      />
      {error && <span className="hdc-form-err">{error}</span>}
      {help && !error && <span className="hdc-form-help">{help}</span>}
    </label>
  );
}
