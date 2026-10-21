"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { createContext, useContext, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { CheckoutBreakdown } from "@/lib/requests/breakdown";
import type { RequestMode } from "@/lib/requests/model";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/**
 * The split checkout, shared by the form and the summary beside it (and the
 * folded summary on phones).
 *
 * The choice «split / together» is made in the form; the summaries follow it:
 * which lines ship now and which go as a request, what is payable now and what
 * stays indicative. Everything reads the one breakdown the page priced on the
 * server (`lib/requests/checkout-breakdown`) — for the postcode the cart
 * remembers, which a typed Τ.Κ. updates and re-renders — so the option tile,
 * the summary and the pay button cannot say three different amounts.
 * `placeOrder` prices from scratch either way and is the authority.
 */

type SplitContext = {
  mode: RequestMode | null;
  setMode: (mode: RequestMode) => void;
  breakdown: CheckoutBreakdown | null;
};

const Context = createContext<SplitContext | null>(null);

export function SplitCheckoutProvider({
  breakdown,
  children,
}: {
  breakdown: CheckoutBreakdown | null;
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<RequestMode | null>(null);
  return <Context.Provider value={{ mode, setMode, breakdown }}>{children}</Context.Provider>;
}

export function useSplitCheckout(): SplitContext | null {
  return useContext(Context);
}

/** What the customer pays now, once the choice says: null while undecided. */
export function payableNow(split: SplitContext | null): number | null {
  if (!split?.breakdown) return null;
  const b = split.breakdown;
  if (b.kind === "all") return 0;
  if (split.mode === "together") return 0;
  if (split.mode === "split" && b.split) return b.split.now.totalGross;
  return null;
}

export type SummaryLine = {
  id: string;
  /** Already shortened for the summary («2904-22 — Κιτ»). */
  name: string;
  image: string | null;
  quantity: number;
  lineGross: number;
};

/** The folded summary's figure on phones: payable now once chosen, else the cart. */
export function SplitSummaryTotal({ locale, fallback }: { locale: string; fallback: number }) {
  const now = payableNow(useSplitCheckout());
  return <b>{formatMoney(now ?? fallback, locale as Locale)}</b>;
}

/**
 * The summary body of a cart with back-order lines (mixed, or all on
 * request). An ordinary cart keeps the page's own summary, untouched.
 */
export function SplitSummaryBody({
  locale,
  lines,
  shippingRowLabel,
  nowAllAt24,
}: {
  locale: string;
  lines: SummaryLine[];
  /** «ACS Courier · 18545», as the page writes it. */
  shippingRowLabel: string;
  /** Every in-stock line at 24% — the VAT line may name the rate. */
  nowAllAt24: boolean;
}) {
  const t = useTranslations("checkout.HdcSplit");
  const split = useSplitCheckout();
  const breakdown = split?.breakdown ?? null;
  if (!breakdown) return null;

  const money = (n: number) => formatMoney(n, locale as Locale);
  const items = (count: number) => (count === 1 ? t("items_one") : t("items_other", { count }));

  // «all»: nothing can ship now, whatever was chosen.
  const mode: RequestMode | null = breakdown.kind === "all" ? "together" : (split?.mode ?? null);
  const requestIds = new Set(
    mode === "together" ? breakdown.together?.lineIds : breakdown.split?.request.lineIds,
  );
  const groups =
    mode === "together"
      ? [{ key: "together", title: t("group_together"), lines }]
      : [
          { key: "now", title: t("group_now"), lines: lines.filter((l) => !requestIds.has(l.id)) },
          { key: "request", title: t("group_request"), lines: lines.filter((l) => requestIds.has(l.id)) },
        ];
  const now = mode === "split" ? (breakdown.split?.now ?? null) : null;
  const request =
    mode === "split" ? (breakdown.split?.request ?? null) : mode === "together" ? breakdown.together : null;

  return (
    <>
      {groups.map((group) =>
        group.lines.length === 0 ? null : (
          <div key={group.key} className="hdc-split-group" data-part={group.key}>
            <h3>
              {group.title} · {items(group.lines.length)}
            </h3>
            <ul className="hdc-mini">
              {group.lines.map((line) => (
                <li key={line.id}>
                  <span className="im">
                    {line.image && <Image src={line.image} alt="" width={64} height={64} sizes="64px" />}
                    <em>{line.quantity}</em>
                  </span>
                  <b>{line.name}</b>
                  <span className="p">{money(line.lineGross)}</span>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}

      {mode == null ? (
        <p className="vat hdc-split-choose">{t("choose_mode")}</p>
      ) : (
        <>
          {now && (
            <dl>
              <div>
                <dt>{t("proionta_now")}</dt>
                <dd>{money(now.subtotalGross)}</dd>
              </div>
              <div>
                <dt>{shippingRowLabel}</dt>
                <dd className={!now.unserviceable && !now.pending && now.shippingGross === 0 ? "fr" : undefined}>
                  {now.unserviceable
                    ? "—"
                    : now.pending
                      ? t("timi_me_tk")
                      : now.shippingGross === 0
                        ? t("dorean")
                        : money(now.shippingGross)}
                </dd>
              </div>
              {now.paymentFeeGross > 0 && (
                <div>
                  <dt>{t("epivarynsi")}</dt>
                  <dd>{money(now.paymentFeeGross)}</dd>
                </div>
              )}
            </dl>
          )}
          <div className="tot">
            <b>{t("payable_now")}</b>
            <span>{money(now ? now.totalGross : 0)}</span>
          </div>
          <p className="vat">
            {now
              ? nowAllAt24
                ? t("vat_24", { amount: money(now.vatAmount) })
                : t("vat", { amount: money(now.vatAmount) })
              : t("nothing_now")}
          </p>
          {now?.thresholdLost && <p className="vat">{t("threshold_lost")}</p>}
          {request && (
            <div className="hdc-split-req">
              <div>
                <b>{t("on_request")}</b>
                <span>{money(request.subtotalGross)}</span>
              </div>
              <small>
                {items(request.itemCount)} ·{" "}
                {mode === "together" ? t("together_shipping_offer") : t("request_shipping_offer")}
              </small>
            </div>
          )}
        </>
      )}
      <Link href="/kalathi" className="edit">
        {t("epexergasia_kalathiou")}
      </Link>
    </>
  );
}
