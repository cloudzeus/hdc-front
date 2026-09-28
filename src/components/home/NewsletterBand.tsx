"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { subscribeAction, type NewsletterFormState } from "@/lib/newsletter/actions";

const INITIAL: NewsletterFormState = { status: "idle", message: "" };

/**
 * The newsletter band (mockup `.nl`): red, title and one line on the left, the
 * email field and a black button on the right.
 *
 * The same subscribe action as before — it writes a pending subscriber and
 * sends a confirmation email; nothing is sent until that link is clicked.
 */
export function NewsletterBand() {
  const t = useTranslations("home.NewsletterBand");
  const [state, action, pending] = useActionState(subscribeAction, INITIAL);

  return (
    <section className="hdc-nl">
      <div className="hdc-wrap hdc-nl-inner">
        <div>
          <h2 className="hdc-disp">{t("titlos")}</h2>
          <p className="hdc-nl-text">{t("keimeno")}</p>
        </div>

        <form action={action} className="hdc-nl-form">
          <div className="hdc-nl-row">
            <label htmlFor="newsletter-email" className="sr-only">
              {t("to_email_sas")}
            </label>
            <input
              id="newsletter-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder={t("to_email_sas")}
            />
            {/*
              Bot trap: hidden from people, tempting to scripts. `tabIndex={-1}`
              and `aria-hidden` so neither the keyboard nor a screen reader
              lands on it.
            */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute h-0 w-0 overflow-hidden opacity-0"
            />
            <button type="submit" disabled={pending}>
              {pending ? "…" : t("eggrafi")}
            </button>
          </div>

          <p aria-live="polite" className="hdc-nl-status">
            {state.message}
          </p>
        </form>
      </div>
    </section>
  );
}
