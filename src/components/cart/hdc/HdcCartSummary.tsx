"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { applyCoupon, setDeliveryPostcode } from "@/lib/cart/actions";

/**
 * «ΣΥΝΟΨΗ» beside the cart (checkout.html, screen 1 `.sum`).
 *
 * Every figure arrives formatted from the server render. The postcode box
 * writes the postcode (a cookie, never the URL) and the page re-renders with
 * the ACS zone for it; the panel does no arithmetic of its own, so the total
 * here is the one checkout opens with.
 */
export function HdcCartSummary({
  postcode,
  rows,
  total,
  vatLine,
}: {
  postcode: string | null;
  /** «Προϊόντα (2)», «Μεταφορικά ACS» … — `free` paints the amount green. */
  rows: Array<{ label: string; value: string; free?: boolean }>;
  total: string;
  vatLine: string;
}) {
  const t = useTranslations("cart.Hdc");
  const [pending, startTransition] = useTransition();
  const [zip, setZip] = useState(postcode ?? "");
  const [zipError, setZipError] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);

  const quote = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = zip.replace(/\s/g, "");
    if (!/^\d{5}$/.test(clean)) {
      setZipError(true);
      return;
    }
    setZipError(false);
    startTransition(async () => {
      await setDeliveryPostcode({ postcode: clean });
    });
  };

  return (
    <aside className="hdc-sum hdc-cart-sum" data-pending={pending || undefined}>
      <h2 className="hdc-disp">{t("synopsi")}</h2>
      <div className="in">
        <form className="zip" onSubmit={quote}>
          <label htmlFor="cart-zip" className="sr-only">
            {t("tk")}
          </label>
          <input
            id="cart-zip"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            placeholder={t("tk")}
            aria-invalid={zipError || undefined}
          />
          <button type="submit" disabled={pending}>
            {t("ypologismos")}
          </button>
        </form>
        <p className={zipError ? "hint err" : "hint"}>
          {zipError ? t("tk_5_psifia") : t("tk_hint")}
        </p>

        <dl>
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd className={row.free ? "fr" : undefined}>{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="tot">
          <b>{t("synolo")}</b>
          <span>{total}</span>
        </div>
        <p className="vat">{vatLine}</p>

        <form
          className="cp"
          onSubmit={(e) => {
            e.preventDefault();
            if (!coupon.trim()) return;
            startTransition(async () => {
              const result = await applyCoupon();
              setCouponError(result.ok ? null : t("kouponi_mi_diathesimo"));
            });
          }}
        >
          <label htmlFor="cart-coupon" className="sr-only">
            {t("kodikos_kouponiou")}
          </label>
          <input
            id="cart-coupon"
            value={coupon}
            onChange={(e) => setCoupon(e.target.value)}
            placeholder={t("kodikos_kouponiou")}
            autoComplete="off"
          />
          <button type="submit" disabled={pending}>
            {t("efarmogi")}
          </button>
        </form>
        {couponError && (
          <p role="alert" className="cperr">
            {couponError}
          </p>
        )}

        <Link href="/checkout" className="hdc-btn hdc-btn-red hdc-btn-lg go">
          {t("oloklirosi")} →
        </Link>
        <div className="pay" aria-label={t("tropoi_pliromis")}>
          <span>VISA</span>
          <span>MASTERCARD</span>
          <span>IRIS</span>
          <span>{t("katathesi")}</span>
        </div>
        <ul className="trust">
          <li>{t("trust_viva")}</li>
          <li>{t("trust_pickup")}</li>
          <li>{t("trust_returns")}</li>
        </ul>
      </div>
    </aside>
  );
}
