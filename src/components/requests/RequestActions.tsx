"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptOfferAction,
  declineOfferAction,
  type RequestActionState,
} from "@/lib/requests/actions";

/**
 * «Αποδοχή & πληρωμή» / «Απόρριψη», and the time left — on the HDC request
 * page (`/aitima/{token}`).
 *
 * Two plain forms posting to server actions, so they work before hydration.
 * They send the token and the offer version the customer is looking at —
 * nothing else; the amount is computed on the server from the stored offer.
 */
export function RequestActions({
  token,
  offerVersion,
  expiresAt,
  mode,
}: {
  token: string;
  offerVersion: number | null;
  /** ISO, for the countdown. Null when there is nothing to count down. */
  expiresAt: string | null;
  /** offer: accept + decline · pay: an accepted, unpaid request (pay again). */
  mode: "offer" | "pay";
}) {
  const t = useTranslations("aitima.Hdc");
  const router = useRouter();
  const [acceptState, accept, accepting] = useActionState<RequestActionState, FormData>(acceptOfferAction, {});
  const [declineState, decline, declining] = useActionState<RequestActionState, FormData>(declineOfferAction, {});
  const [confirming, setConfirming] = useState(false);

  // The page is server-rendered from the order; after a decline (or a refused
  // accept) it is read again to show the new state.
  useEffect(() => {
    if (declineState.done || declineState.error || acceptState.error) router.refresh();
  }, [declineState, acceptState.error, router]);

  const error = acceptState.error ?? declineState.error;
  const busy = accepting || declining;

  return (
    <div className="hdc-req-acts">
      {mode === "offer" && expiresAt && <Countdown expiresAt={expiresAt} label={t("remaining")} />}

      {error && (
        <p role="alert" className="err">
          {t(`error_${error}`)}
        </p>
      )}
      {declineState.done && (
        <p role="status" className="hint">
          {t("declined_done")}
        </p>
      )}

      <form action={accept}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="offerVersion" value={offerVersion ?? ""} />
        <button type="submit" name="method" value="card" disabled={busy} className="hdc-btn hdc-btn-red hdc-btn-lg">
          {accepting ? t("pending") : `${mode === "pay" ? t("pay_again") : t("accept")} →`}
        </button>
        <p className="hint">{t("pay_hint")}</p>
        {/* Το ίδιο, με κατάθεση: ο πελάτης παίρνει IBAN και κωδικό αιτιολογίας. */}
        <button type="submit" name="method" value="bank" disabled={busy} className="hdc-btn hdc-btn-line hdc-btn-lg">
          {mode === "pay" ? t("pay_bank_again") : t("accept_bank")}
        </button>
        <p className="hint">{t("pay_bank_hint")}</p>
      </form>

      {mode === "offer" && (
        <form
          action={decline}
          onSubmit={(event) => {
            if (!confirming) {
              event.preventDefault();
              setConfirming(true);
            }
          }}
        >
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="offerVersion" value={offerVersion ?? ""} />
          {confirming && <p className="hint">{t("decline_confirm")}</p>}
          <button type="submit" disabled={busy} className="hdc-btn hdc-btn-line hdc-btn-lg">
            {declining ? t("pending") : t("decline")}
          </button>
        </form>
      )}
    </div>
  );
}

function Countdown({ expiresAt, label }: { expiresAt: string; label: string }) {
  const end = Date.parse(expiresAt);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  // Nothing on the server render: the clock there is not the visitor's.
  if (now == null || !Number.isFinite(end)) return null;
  const left = Math.max(0, end - now);
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const text = days > 0 ? `${days}d ${hours}h` : `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return (
    <p className="hdc-req-count">
      <span>{label}</span>
      <b>{text}</b>
    </p>
  );
}
