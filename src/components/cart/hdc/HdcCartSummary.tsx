"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { applyCoupon, setDeliveryDestination, setDeliveryPostcode } from "@/lib/cart/actions";
import { validatePostcode } from "@/lib/shipping/destination";
import { countryOptions, postcodeExample, validateCountryPostcode } from "@/lib/shipping/countries";
import { euSalesCountryOptions } from "@/lib/eu-sales/countries";
import type { CartSplitKind } from "@/lib/requests/model";

/**
 * «ΣΥΝΟΨΗ» beside the cart (checkout.html, screen 1 `.sum`).
 *
 * Every figure arrives formatted from the server render. The postcode box
 * writes the postcode (a cookie, never the URL) and the page re-renders with
 * the ACS zone for it; the panel does no arithmetic of its own, so the total
 * here is the one checkout opens with.
 */
export function HdcCartSummary({
  requestKind = "none",
  postcode,
  unserviceable = false,
  rows,
  total,
  vatLine,
  international = false,
  country: initialCountry = "GR",
  city: initialCity = "",
  quoteUnavailable = false,
  euSales = false,
}: {
  /**
   * Back-order requests (docs/backorder-requests.md): «all» — nothing is in
   * stock, checkout sends a request; «mixed» — checkout asks. From the server's
   * cart; checkout decides again on submit.
   */
  requestKind?: CartSplitKind;
  postcode: string | null;
  /** ACS has no station for `postcode`: we do not deliver there. */
  unserviceable?: boolean;
  /** «Προϊόντα (2)», «Μεταφορικά ACS» … — `free` paints the amount green. */
  rows: Array<{ label: string; value: string; free?: boolean }>;
  total: string;
  vatLine: string;
  /**
   * INTERNATIONAL_SHIPPING_ENABLED, read by the page (docs/dhl-express.md §4):
   * a country select beside the postcode. Off: the Greek postcode box as it was.
   */
  international?: boolean;
  /** The destination the page priced; "GR" at home. */
  country?: string;
  city?: string;
  /** Abroad, nobody could price it (HDCtool/DHL down). */
  quoteUnavailable?: boolean;
  /** EU_SALES_ENABLED: Greece and the DHL countries — no Cyprus. */
  euSales?: boolean;
}) {
  const t = useTranslations("cart.Hdc");
  const locale = useLocale();
  const [country, setCountry] = useState(initialCountry);
  const [city, setCity] = useState(initialCity);
  const abroad = international && country !== "GR";
  /* DHL prices with the city; ACS (Greece, Cyprus) does not need it. */
  const needsCity = abroad && country !== "CY";
  const [pending, startTransition] = useTransition();
  const [zip, setZip] = useState(postcode ?? "");
  const [zipError, setZipError] = useState<"format" | "range" | null>(null);
  const [coupon, setCoupon] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);

  // The server's verdict holds for the postcode it was given, until another is typed.
  const showUnserviceable =
    unserviceable && zipError == null && zip.replace(/\s/g, "") === (postcode ?? "");

  const quote = (e: React.FormEvent) => {
    e.preventDefault();
    if (abroad) {
      // The selected country's format (lib/shipping/countries).
      const checked = validateCountryPostcode(country, zip);
      if (!checked.ok) {
        setZipError("format");
        return;
      }
      setZipError(null);
      startTransition(async () => {
        await setDeliveryDestination({ country, postcode: checked.postcode, city });
      });
      return;
    }
    // Greek postcodes only: five digits, 10xxx–85xxx (see lib/shipping/destination).
    const checked = validatePostcode(zip);
    if (!checked.ok) {
      setZipError(checked.reason === "range" ? "range" : "format");
      return;
    }
    setZipError(null);
    startTransition(async () => {
      // With the flag on, Greece also forgets a destination abroad.
      if (international) await setDeliveryDestination({ country: "GR", postcode: checked.postcode });
      else await setDeliveryPostcode({ postcode: checked.postcode });
    });
  };

  const chooseCountry = (next: string) => {
    setCountry(next);
    setZipError(null);
    const keep = validateCountryPostcode(next, zip);
    startTransition(async () => {
      await setDeliveryDestination({ country: next, postcode: keep.ok ? keep.postcode : "", city });
    });
  };

  return (
    <aside className="hdc-sum hdc-cart-sum" data-pending={pending || undefined}>
      <h2 className="hdc-disp">{t("synopsi")}</h2>
      <div className="in">
        {international && (
          <div className="zip-country">
            <label htmlFor="cart-country" className="sr-only">
              {t("chora")}
            </label>
            <select
              id="cart-country"
              value={country}
              onChange={(e) => chooseCountry(e.target.value)}
              autoComplete="country"
              disabled={pending}
            >
              {(euSales ? euSalesCountryOptions(locale) : countryOptions(locale)).map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
            {needsCity && (
              <>
                <label htmlFor="cart-city" className="sr-only">
                  {t("poli")}
                </label>
                <input
                  id="cart-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  autoComplete="address-level2"
                  maxLength={120}
                  placeholder={t("poli")}
                />
              </>
            )}
          </div>
        )}
        <form className="zip" onSubmit={quote}>
          <label htmlFor="cart-zip" className="sr-only">
            {t("tk")}
          </label>
          <input
            id="cart-zip"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            inputMode={abroad ? "text" : "numeric"}
            autoComplete="postal-code"
            maxLength={abroad ? 10 : 6}
            placeholder={abroad ? postcodeExample(country) : t("tk")}
            aria-invalid={zipError != null || showUnserviceable || undefined}
            aria-describedby="cart-zip-hint"
          />
          <button type="submit" disabled={pending}>
            {t("ypologismos")}
          </button>
        </form>
        <p
          id="cart-zip-hint"
          className={zipError || showUnserviceable || (abroad && quoteUnavailable) ? "hint err" : "hint"}
          role={zipError || showUnserviceable || (abroad && quoteUnavailable) ? "alert" : undefined}
        >
          {abroad
            ? zipError
              ? t("tk_format_country", { example: postcodeExample(country) })
              : showUnserviceable
                ? t("tk_unserviceable_eu")
                : quoteUnavailable
                  ? t("quote_unavailable")
                  : t("tk_hint_abroad")
            : zipError === "format"
              ? t("tk_5_psifia")
              : zipError === "range" || showUnserviceable
                ? international
                  ? t("tk_unserviceable_eu")
                  : t("tk_unserviceable")
                : t("tk_hint")}
        </p>
        <p className="hint">{euSales ? t("eu_ship_zone") : international ? t("ship_zone_eu") : t("ship_zone")}</p>

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

        {requestKind !== "none" && (
          <p className="hdc-info" role="status">
            {requestKind === "all" ? t("request_all") : t("request_mixed")}
          </p>
        )}

        <Link href="/checkout" className="hdc-btn hdc-btn-red hdc-btn-lg go">
          {requestKind === "all" ? t("synecheia_aitima") : t("oloklirosi")} →
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
