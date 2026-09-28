"use client";

import { useActionState } from "react";
import { requestEmailProofAction } from "@/lib/account/actions";

/**
 * Asks the customer to prove their email before guest orders are shown.
 *
 * Shown only to accounts that have not proven it. The wording never says
 * whether guest orders exist: "if you ordered as a guest, they will appear",
 * which is true either way.
 *
 * Strings come from the page (server translations), so the three locales stay
 * in the message files with everything else.
 */
export function EmailProofPanel({
  text,
}: {
  text: {
    title: string;
    body: string;
    steps: string[];
    button: string;
    sending: string;
    sent: string;
    sentHint: string;
  };
}) {
  const [state, action, pending] = useActionState(requestEmailProofAction, {});

  return (
    <section aria-live="polite" className="hdc-proof">
      <h2>{text.title}</h2>
      {state.sent ? (
        <>
          <p>{text.sent}</p>
          <p className="sub">{text.sentHint}</p>
        </>
      ) : (
        <>
          <p>{text.body}</p>
          <ol>
            {text.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {state.error && (
            <p role="alert" className="err">
              {state.error}
            </p>
          )}
          <form action={action}>
            <button type="submit" disabled={pending} className="hdc-btn hdc-btn-ink">
              {pending ? text.sending : text.button}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
