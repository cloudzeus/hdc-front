"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { reorder } from "@/lib/cart/actions";
import type { ReorderPlan } from "@/lib/cart/reorder";
import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";

/**
 * «ΞΑΝΑ ΣΤΟ ΚΑΛΑΘΙ» — and then say what happened.
 *
 * A reorder is the one action where the customer's expectation and reality
 * routinely differ: they expect their old order, and what they get is today's
 * catalogue at today's prices. So nothing is swallowed. Items that no longer
 * exist are named, not counted; prices that moved are shown then → now, before
 * checkout rather than at it. The report opens under the button and stays
 * until it is dismissed, and it does not navigate — the link to the cart is
 * offered, so leaving is the customer's decision once they have read it.
 *
 * `variant="text"`: the small red line under a row's total (account.html,
 * screen 2). `variant="button"`: the red button on the order page (screen 3).
 */
export function ReorderButton({
  orderNumber,
  token,
  locale,
  variant = "button",
}: {
  orderNumber: string;
  /** The confirmation link's `?t=`, so a customer who never registered can reorder too. */
  token?: string;
  locale: Locale;
  variant?: "button" | "text" | "line";
}) {
  const t = useTranslations("account.Hdc");
  const [pending, startTransition] = useTransition();
  const [plan, setPlan] = useState<ReorderPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    setPlan(null);
    startTransition(async () => {
      const result = await reorder({ orderNumber, token });
      if (result.ok) setPlan(result.plan);
      else
        setError(
          result.error === "not_found"
            ? t("reorder_not_found")
            : result.error === "forbidden"
              ? t("reorder_forbidden")
              : result.error === "nothing_available"
                ? t("reorder_nothing")
                : t("reorder_failed"),
        );
    });
  }

  const money = (n: number) => formatMoney(n, locale);
  const className =
    variant === "text"
      ? "act"
      : variant === "line"
        ? "hdc-btn hdc-btn-line"
        : "hdc-btn hdc-btn-red";

  return (
    <div className="hdc-reorder">
      <button type="button" onClick={run} disabled={pending} className={className} aria-expanded={plan != null}>
        {pending ? t("reorder_pending") : t("xana_sto_kalathi")}
      </button>

      {error && (
        <span role="alert" className="hdc-reorder-err">
          {error}
        </span>
      )}

      {plan && (
        <div className="hdc-reorder-panel" role="status">
          <button type="button" className="x" onClick={() => setPlan(null)} aria-label={t("kleisimo")}>
            ×
          </button>
          <b>✓ {t("reorder_added", { count: plan.units })}</b>

          {/* Named, not counted: "2 items unavailable" sends somebody hunting. */}
          {plan.skipped.length > 0 && (
            <>
              <h4>{t("reorder_skipped")}</h4>
              <ul>
                {plan.skipped.map((s, i) => (
                  <li key={`${s.name}-${i}`}>
                    {s.name}{" "}
                    <span>
                      · {s.reason === "delisted" ? t("reorder_delisted") : t("reorder_no_price")}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {plan.priceChanges.length > 0 && (
            <>
              <h4>{t("reorder_price_changed")}</h4>
              <ul>
                {plan.priceChanges.map((c, i) => (
                  <li key={`${c.name}-${i}`}>
                    {c.name} <s>{money(c.then)}</s> {money(c.now)}
                  </li>
                ))}
              </ul>
              <ul>
                <li>
                  <span>{t("reorder_net")}</span>
                </li>
              </ul>
            </>
          )}

          <Link href="/kalathi" className="hdc-btn hdc-btn-ink">
            {t("sto_kalathi")} →
          </Link>
        </div>
      )}
    </div>
  );
}
