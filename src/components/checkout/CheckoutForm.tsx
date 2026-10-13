"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef, useState, useTransition } from "react";
import { CompanyVatFields } from "@/components/account/CompanyVatFields";
import { AddressAutocomplete } from "@/components/checkout/AddressAutocomplete";
import { Link } from "@/i18n/navigation";
import { setCartOptions, setDeliveryDestination, setDeliveryPostcode } from "@/lib/cart/actions";
import { PAYMENT_METHODS, SHIPPING_METHODS, shippingMethodsFor } from "@/lib/cart/options";
import { placeOrder, type CheckoutState } from "@/lib/checkout/actions";
import { STOCK_HOLD_HOURS } from "@/lib/orders/hold";
import { foreignCountryIn, validatePostcode } from "@/lib/shipping/destination";
import { countryOptions, postcodeExample, validateCountryPostcode } from "@/lib/shipping/countries";
import type { CartSplitKind, RequestMode } from "@/lib/requests/model";

/**
 * The HDC checkout form (checkout.html, screen 2 and the second phone frame).
 *
 * One `<form>` posting to one server action, as before. Six numbered steps in
 * the mockup's order: contact, pickup method, delivery address, payment,
 * account (guests only), notes and terms. The pickup method comes BEFORE the
 * address, and choosing the shop hides the address altogether — its fields sit
 * in a disabled fieldset, so they are neither submitted nor validated, and the
 * server (`checkoutSchema`) does not ask for them on a pickup order. The
 * invoice option is not part of the address: with pickup it moves under the
 * pickup tiles and stays available.
 *
 * Desktop shows every step open. Phones show one: completed steps fold into a
 * «✓ … Αλλαγή» row and the fixed bar at the bottom moves on step by step,
 * checking the open step's fields first.
 *
 * Every rule expressed here is enforced again in the action; a disabled button
 * is an affordance, not a control.
 */

type StepKey = "request" | "contact" | "shipping" | "address" | "payment" | "account" | "notes";

export type ShippingOption = {
  id: string;
  title: string;
  /** Mixed case, for the folded phone row: «ACS Courier · δωρεάν». */
  label: string;
  meta: string;
  /** Formatted price, «ΔΩΡΕΑΝ», or null when it needs a postcode first. */
  price: string | null;
  free: boolean;
};

/**
 * How the page's quote for the remembered destination abroad came out
 * (docs/dhl-express.md §1): priced, waiting for a Τ.Κ., refused (422 code, or
 * ACS «no station» for Cyprus), or nobody could price it.
 */
export type DestinationQuoteStatus =
  | "ok"
  | "pending"
  | "unavailable"
  | "unserviceable"
  | "unserviceable_postcode"
  | "unsupported_country"
  | "invalid_postcode"
  | "invalid_address";

type Prefill = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  shipLine1: string;
  shipLine2: string;
  shipCity: string;
  shipPostcode: string;
  shipRegion: string;
  shipAdminRegion: string;
};

export function CheckoutForm({
  locale,
  postcode,
  unserviceablePostcode = null,
  signedIn = false,
  prefill,
  shippingMethod,
  paymentMethod,
  shippingOptions,
  total,
  requestKind = "none",
  international = false,
  destination = null,
  quoteStatus = null,
}: {
  locale: string;
  /** The postcode the quotes were priced for (cookie or saved address). */
  postcode: string;
  /** `postcode` again when ACS has no station for it — we do not deliver there. */
  unserviceablePostcode?: string | null;
  /** Somebody with an account is not offered another one. */
  signedIn?: boolean;
  /** What we already know about a signed-in customer — seeds, never locks. */
  prefill?: Prefill | null;
  /** What the basket recorded. Seeds the controls below. */
  shippingMethod: string;
  paymentMethod: string;
  shippingOptions: ShippingOption[];
  /** VAT-inclusive total, formatted — for the phone's bottom bar. */
  total: string;
  /**
   * Back-order requests (docs/backorder-requests.md), from the cart as the page
   * rendered it. «all»: nothing to pay, the submit sends a request. «mixed»:
   * the customer must choose split or together (a step of its own). The action
   * re-reads the stock and decides again — this only shapes the form.
   */
  requestKind?: CartSplitKind;
  /**
   * INTERNATIONAL_SHIPPING_ENABLED, read by the page (docs/dhl-express.md §4).
   * Off: no country field, Greece only — the form exactly as it was.
   */
  international?: boolean;
  /** The destination abroad the page priced (`destination-cookie`); null at home. */
  destination?: { country: string; postcode: string; city: string } | null;
  /** How that price came out. */
  quoteStatus?: DestinationQuoteStatus | null;
}) {
  const t = useTranslations("checkout.Hdc");
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, {});
  const form = useRef<HTMLFormElement>(null);
  const [shipping, setShipping] = useState<string>(shippingMethod);
  const [payment, setPayment] = useState<string>(paymentMethod);
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [terms, setTerms] = useState(false);
  const [, startTransition] = useTransition();
  const lastPostcode = useRef(postcode);
  const postcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * The delivery country (flag on only). Greece and Cyprus: ACS, as before.
   * The rest of the EU: DHL Express. The choice, Τ.Κ. and city go to the
   * server (`setDeliveryDestination`), which re-renders the tiles and the
   * summary priced by HDCtool; the action asks again and charges its answer.
   */
  const [country, setCountry] = useState<string>(
    international && destination ? destination.country : "GR",
  );
  const abroad = international && country !== "GR";
  const methods = international ? shippingMethodsFor(country) : SHIPPING_METHODS;
  /* A choice that does not fit the country (ACS Express to Italy) falls to the first that does. */
  const chosen = methods.some((m) => m.id === shipping) ? shipping : methods[0].id;
  const destinationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendDestination = (fields: { country: string; postcode: string; city: string }, delay = 500) => {
    if (destinationTimer.current) clearTimeout(destinationTimer.current);
    destinationTimer.current = setTimeout(() => {
      startTransition(async () => {
        await setDeliveryDestination(fields);
      });
    }, delay);
  };

  const pickup = chosen === "pickup";
  const isOnline = payment === "card" || payment === "iris";
  const [requestMode, setRequestMode] = useState<RequestMode | null>(null);
  /* Nothing is paid now: the whole cart, or everything by choice, is a request. */
  const requestOnly = requestKind === "all" || (requestKind === "mixed" && requestMode === "together");
  const modeMissing = requestKind === "mixed" && requestMode == null;

  const steps: StepKey[] = [
    ...(requestKind === "mixed" ? (["request"] as const) : []),
    "contact",
    "shipping",
    ...(pickup ? [] : (["address"] as const)),
    ...(requestOnly ? [] : (["payment"] as const)),
    ...(signedIn ? [] : (["account"] as const)),
    "notes",
  ];
  const numberOf = (key: StepKey) => steps.indexOf(key) + 1;

  // Phones: the one open step. Desktop CSS ignores it.
  const [open, setOpen] = useState<StepKey>(requestKind === "mixed" ? "request" : "contact");
  const openIndex = Math.max(0, steps.indexOf(open));
  const stateOf = (key: StepKey) => {
    const i = steps.indexOf(key);
    return i < openIndex ? "done" : i === openIndex ? "open" : "todo";
  };

  // What the folded rows say — read from the form, not duplicated in state.
  const [values, setValues] = useState<Record<string, string>>({});
  const readValues = () => {
    if (!form.current) return;
    const data = new FormData(form.current);
    const next: Record<string, string> = {};
    for (const [k, v] of data.entries()) if (typeof v === "string") next[k] = v;
    setValues(next);
  };

  /*
   * Written back to the cart on every change, as before: the summary beside
   * the form is server-rendered from the cart row, and a form that says
   * «collect from the shop» next to a panel still charging a courier is the
   * disagreement this prevents. The action prices from what is submitted
   * regardless.
   */
  const remember = (patch: { shippingMethod?: string; paymentMethod?: string }) =>
    startTransition(async () => {
      await setCartOptions(patch);
    });

  /* A complete Τ.Κ. re-prices the tiles and the summary for its ACS zone. */
  const onPostcode = (value: string) => {
    if (abroad) return;
    const clean = value.replace(/\s/g, "");
    if (!/^\d{5}$/.test(clean) || clean === lastPostcode.current) return;
    if (postcodeTimer.current) clearTimeout(postcodeTimer.current);
    postcodeTimer.current = setTimeout(() => {
      lastPostcode.current = clean;
      startTransition(async () => {
        await setDeliveryPostcode({ postcode: clean });
      });
    }, 400);
  };

  /** Phones: check the open step's own fields, then open the next one. */
  const next = () => {
    const section = form.current?.querySelector<HTMLElement>(`[data-step="${open}"]`);
    const controls = section
      ? Array.from(
          section.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
            "input:not([type=hidden]), textarea",
          ),
        )
      : [];
    const invalid = controls.find((c) => !c.disabled && !c.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    readValues();
    const following = steps[openIndex + 1];
    if (following) {
      setOpen(following);
      requestAnimationFrame(() =>
        form.current
          ?.querySelector(`[data-step="${following}"]`)
          ?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
    }
  };

  /*
   * A submit with an invalid field in a folded step: the browser cannot focus
   * a hidden control and would refuse silently. Open that step first, then let
   * it say what is wrong.
   */
  const guardSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
    const f = form.current;
    if (!f || f.checkValidity()) return;
    e.preventDefault();
    const invalid = f.querySelector<HTMLInputElement>(":invalid:not(fieldset)");
    const key = invalid?.closest<HTMLElement>("[data-step]")?.dataset.step as StepKey | undefined;
    if (key) setOpen(key);
    requestAnimationFrame(() => invalid?.reportValidity());
  };

  /*
   * Greece only — the same checks the action makes (lib/shipping/destination),
   * run here so the customer hears it while typing rather than after submit.
   * The postcode is judged once it is complete; the street, city and regions
   * for a foreign country's name. The server stays the authority.
   */
  const addressValue = (name: string): string => {
    if (values[name] !== undefined) return values[name];
    if (name === "shipPostcode") return (abroad && destination?.postcode) || prefill?.shipPostcode || postcode;
    if (name === "shipCity" && abroad && destination?.city) return destination.city;
    return (prefill?.[name as keyof Prefill] as string | undefined) ?? "";
  };
  const addressErrors: Record<string, string> = {};
  let quoteBlocked = false;
  if (!pickup && !abroad) {
    const zip = addressValue("shipPostcode").trim();
    const checked = validatePostcode(zip);
    const complete = zip.replace(/\s/g, "").length >= 5 || /[^\d\s]/.test(zip);
    if ((!checked.ok && complete) || (checked.ok && checked.postcode === unserviceablePostcode)) {
      addressErrors.shipPostcode = international ? t("tk_unserviceable_eu") : t("tk_unserviceable");
    }
    for (const name of ["shipLine1", "shipLine2", "shipCity", "shipRegion", "shipAdminRegion"]) {
      if (foreignCountryIn(addressValue(name))) {
        addressErrors[name] = international ? t("address_foreign_eu") : t("address_foreign");
      }
    }
  }
  if (!pickup && abroad) {
    const zip = addressValue("shipPostcode").trim();
    const example = postcodeExample(country);
    const checked = validateCountryPostcode(country, zip);
    // The page's price holds for the place it was asked for, until another is typed.
    const priced =
      checked.ok &&
      destination?.country === country &&
      destination.postcode === checked.postcode &&
      destination.city === addressValue("shipCity").trim();
    if (!checked.ok && zip.replace(/[\s-]/g, "").length >= example.replace(/[\s-]/g, "").length) {
      addressErrors.shipPostcode = t("postcode_format", { example });
    } else if (priced && quoteStatus === "unavailable") {
      addressErrors.quote = t("quote_unavailable");
    } else if (priced && quoteStatus && quoteStatus !== "ok" && quoteStatus !== "pending") {
      addressErrors.shipPostcode = t(`refused_${quoteStatus}`);
    }
    // Nothing is placed abroad without a price HDCtool gave for this very place.
    quoteBlocked = !(priced && quoteStatus === "ok");
  }
  const blocked = Object.values(addressErrors)[0] ?? null;
  const fieldError = (name: string) => addressErrors[name] ?? state.fieldErrors?.[name];

  const shipTitle = shippingOptions.find((o) => o.id === chosen);
  const payLabel = (id: string) =>
    id === "card" ? t("pay_card") : id === "iris" ? "IRIS" : t("pay_bank");
  const payLabelShort = (id: string) =>
    id === "card" ? t("pay_card") : id === "iris" ? "IRIS" : t("pay_bank_short");

  const summaries: Record<StepKey, string> = {
    request: requestMode === "split" ? t("request_mode_split") : requestMode === "together" ? t("request_mode_together") : "",
    contact: [
      [values.firstName, values.lastName].filter(Boolean).join(" "),
      values.phone,
    ]
      .filter(Boolean)
      .join(" · "),
    shipping: [
      shipTitle?.label,
      shipTitle?.free ? t("dorean_mikra") : shipTitle?.price,
      pickup && wantsInvoice ? t("timologio") : null,
    ]
      .filter(Boolean)
      .join(" · "),
    address: [
      [values.shipPostcode, values.shipCity].filter(Boolean).join(" "),
      wantsInvoice ? t("timologio") : null,
    ]
      .filter(Boolean)
      .join(" · "),
    payment: payLabel(payment),
    account: values.password ? t("me_logariasmo") : t("os_episkeptis"),
    notes: "",
  };

  const invoiceBlock = (
    <div className="hdc-co-invoice">
      <label className="hdc-chk">
        <input
          type="checkbox"
          name="wantsInvoice"
          checked={wantsInvoice}
          onChange={(e) => setWantsInvoice(e.target.checked)}
        />
        <i aria-hidden />
        <span>
          <b>{t("thelo_timologio")}</b> — {t("thelo_timologio_sub")}
        </span>
      </label>
      {wantsInvoice && (
        <div className="hdc-co-inv">
          <CompanyVatFields variant="hdc" required fieldErrors={state.fieldErrors} />
        </div>
      )}
    </div>
  );

  const submitLabel = pending
    ? t("ginetai_katachorisi")
    : requestOnly
      ? `${t("apostoli_aitimatos")} →`
      : isOnline
      ? `${t("pliromi_me_asfaleia")} →`
      : `${t("oloklirosi_paraggelias")} →`;

  return (
    <form
      ref={form}
      action={action}
      className="hdc-co-form"
      onChange={(e) => {
        const target = e.target as unknown as HTMLInputElement;
        if (target.name === "shipPostcode") onPostcode(target.value);
        if (abroad && (target.name === "shipPostcode" || target.name === "shipCity") && form.current) {
          const data = new FormData(form.current);
          sendDestination({
            country,
            postcode: String(data.get("shipPostcode") ?? ""),
            city: String(data.get("shipCity") ?? ""),
          });
        }
        readValues();
      }}
    >
      <input type="hidden" name="locale" value={locale} />

      {state.error && (
        <p role="alert" className="hdc-co-error">
          {state.error}
        </p>
      )}

      {requestKind === "mixed" && (
        <Step
          k="request"
          n={numberOf("request")}
          state={stateOf("request")}
          title={t("s_request")}
          summary={summaries.request}
          onEdit={() => setOpen("request")}
          changeLabel={t("allagi")}
        >
          <p className="hdc-info hdc-req-intro">{t("request_mode_intro")}</p>
          <div className="hdc-ship two" role="radiogroup" aria-label={t("s_request")}>
            {(["split", "together"] as const).map((mode) => (
              <label key={mode} className={requestMode === mode ? "on" : undefined}>
                <input
                  type="radio"
                  name="requestMode"
                  value={mode}
                  required
                  checked={requestMode === mode}
                  onChange={() => setRequestMode(mode)}
                />
                <b>{mode === "split" ? t("request_mode_split") : t("request_mode_together")}</b>
                <span>{mode === "split" ? t("request_mode_split_help") : t("request_mode_together_help")}</span>
                <strong className="ask">{t("request_mode_price")}</strong>
              </label>
            ))}
          </div>
          {state.fieldErrors?.requestMode && <p className="hdc-co-ferr">{t("request_mode_required")}</p>}
        </Step>
      )}

      <Step
        k="contact"
        n={numberOf("contact")}
        state={stateOf("contact")}
        title={t("s_contact")}
        summary={summaries.contact}
        onEdit={() => setOpen("contact")}
        changeLabel={t("allagi")}
        aside={
          !signedIn && (
            <Link href={{ pathname: "/eisodos", query: { redirectTo: "/checkout" } }}>
              {t("echete_logariasmo")}
            </Link>
          )
        }
      >
        <div className="f2">
          <Field label={t("onoma")} name="firstName" autoComplete="given-name" placeholder={t("onoma_ph")} defaultValue={prefill?.firstName} error={state.fieldErrors?.firstName} required />
          <Field label={t("eponymo")} name="lastName" autoComplete="family-name" placeholder={t("eponymo_ph")} defaultValue={prefill?.lastName} error={state.fieldErrors?.lastName} required />
          <Field label="EMAIL" name="email" type="email" autoComplete="email" placeholder={t("email_ph")} defaultValue={prefill?.email} error={state.fieldErrors?.email} required />
          <Field label={t("kinito")} name="phone" type="tel" autoComplete="tel" placeholder={abroad ? "+39 …" : "69…"} defaultValue={prefill?.phone} error={state.fieldErrors?.phone} required help={abroad ? t("phone_intl_help") : t("kinito_help")} />
        </div>
      </Step>

      <Step
        k="shipping"
        n={numberOf("shipping")}
        state={stateOf("shipping")}
        title={t("s_shipping")}
        summary={summaries.shipping}
        onEdit={() => setOpen("shipping")}
        changeLabel={t("allagi")}
      >
        {international && (
          <label className="hdc-fld hdc-co-country">
            <span className="lbl">
              {t("chora")}
              <em> *</em>
            </span>
            <select
              name="shipCountry"
              value={country}
              autoComplete="country"
              onChange={(e) => {
                const next = e.target.value;
                setCountry(next);
                const offered = shippingMethodsFor(next);
                if (!offered.some((m) => m.id === shipping)) {
                  setShipping(offered[0].id);
                  remember({ shippingMethod: offered[0].id });
                }
                const data = form.current ? new FormData(form.current) : null;
                sendDestination(
                  {
                    country: next,
                    postcode: String(data?.get("shipPostcode") ?? ""),
                    city: String(data?.get("shipCity") ?? ""),
                  },
                  0,
                );
              }}
              aria-invalid={state.fieldErrors?.shipCountry ? true : undefined}
            >
              {countryOptions(locale).map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
            {state.fieldErrors?.shipCountry && <span className="err">{state.fieldErrors.shipCountry}</span>}
          </label>
        )}
        <div className="hdc-ship" role="radiogroup" aria-label={t("s_shipping")}>
          {methods.map((method) => {
            const option = shippingOptions.find((o) => o.id === method.id);
            const on = chosen === method.id;
            return (
              <label key={method.id} className={on ? "on" : undefined}>
                <input
                  type="radio"
                  name="shippingMethod"
                  value={method.id}
                  checked={on}
                  onChange={() => {
                    setShipping(method.id);
                    remember({ shippingMethod: method.id });
                  }}
                />
                <b>{option?.title ?? method.label}</b>
                <span>{option?.meta ?? method.meta}</span>
                {option?.price ? (
                  <strong className={option.free ? "fr" : undefined}>{option.price}</strong>
                ) : (
                  <strong className="ask">{method.id === "dhl" ? t("timi_apo_dhl") : t("timi_apo_acs")}</strong>
                )}
              </label>
            );
          })}
        </div>
        {pickup && invoiceBlock}
      </Step>

      {/*
        Hidden AND disabled for pickup: a disabled fieldset takes its fields out
        of the submission and out of validation, and keeps what was typed for
        whoever switches back to a courier.
      */}
      <Step
        k="address"
        n={numberOf("address")}
        state={stateOf("address")}
        title={t("s_address")}
        summary={summaries.address}
        onEdit={() => setOpen("address")}
        changeLabel={t("allagi")}
        hidden={pickup}
      >
        <fieldset disabled={pickup}>
          <div className="f21">
            <AddressAutocomplete
              variant="hdc"
              label={t("odos")}
              name="shipLine1"
              defaultValue={prefill?.shipLine1}
              error={fieldError("shipLine1")}
              required
            />
            <Field label={t("orofos")} name="shipLine2" defaultValue={prefill?.shipLine2} autoComplete="address-line2" error={fieldError("shipLine2")} invalid={addressErrors.shipLine2} />
          </div>
          <div className="f4">
            <Field
              label={t("tk")}
              name="shipPostcode"
              autoComplete="postal-code"
              inputMode={abroad ? "text" : "numeric"}
              placeholder={abroad ? postcodeExample(country) : undefined}
              help={abroad ? t("postcode_help_abroad", { example: postcodeExample(country) }) : undefined}
              defaultValue={addressValue("shipPostcode")}
              error={fieldError("shipPostcode")}
              invalid={addressErrors.shipPostcode}
              required
            />
            <Field label={t("poli")} name="shipCity" autoComplete="address-level2" placeholder={t("poli_ph")} defaultValue={addressValue("shipCity")} error={fieldError("shipCity")} invalid={addressErrors.shipCity} required />
            <Field label={t("nomos")} name="shipRegion" autoComplete="address-level1" defaultValue={prefill?.shipRegion} error={fieldError("shipRegion")} invalid={addressErrors.shipRegion} />
            <Field label={t("perifereia")} name="shipAdminRegion" defaultValue={prefill?.shipAdminRegion} error={fieldError("shipAdminRegion")} invalid={addressErrors.shipAdminRegion} />
          </div>
          <p className="hdc-info">{international ? t("ship_zone_eu") : t("ship_zone")}</p>
        </fieldset>
        {!pickup && invoiceBlock}
      </Step>

      {requestKind === "all" && <p className="hdc-info">{t("request_all_note")}</p>}

      {!requestOnly && (
      <Step
        k="payment"
        n={numberOf("payment")}
        state={stateOf("payment")}
        title={t("s_payment")}
        summary={summaries.payment}
        onEdit={() => setOpen("payment")}
        changeLabel={t("allagi")}
      >
        <div className="hdc-payopts" role="radiogroup" aria-label={t("s_payment")}>
          {PAYMENT_METHODS.filter((m) => !m.partnerOnly).map((method) => (
            <label key={method.id} className={payment === method.id ? "on" : undefined}>
              <input
                type="radio"
                name="paymentMethod"
                value={method.id}
                checked={payment === method.id}
                onChange={() => {
                  setPayment(method.id);
                  remember({ paymentMethod: method.id });
                }}
              />
              <span className="long">{payLabel(method.id)}</span>
              <span className="short">{payLabelShort(method.id)}</span>
            </label>
          ))}
        </div>
        <p className="hdc-info">
          {payment === "card"
            ? t("info_card")
            : payment === "iris"
              ? t("info_iris")
              : /* The hours come from the constant the checkout enforces. */
                t("info_bank", { hours: STOCK_HOLD_HOURS })}
        </p>
      </Step>
      )}

      {!signedIn && (
        <Step
          k="account"
          n={numberOf("account")}
          state={stateOf("account")}
          title={t("s_account")}
          titleNote={t("proairetika")}
          summary={summaries.account}
          onEdit={() => setOpen("account")}
          changeLabel={t("allagi")}
        >
          <div className="narrow">
            <Field
              label={t("kodikos")}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder={t("kodikos_ph")}
              help={t("kodikos_help")}
              error={state.fieldErrors?.password}
            />
          </div>
        </Step>
      )}

      <Step
        k="notes"
        n={numberOf("notes")}
        state={stateOf("notes")}
        title={t("s_notes")}
        titleShort={t("s_notes_short")}
        summary=""
        onEdit={() => setOpen("notes")}
        changeLabel={t("allagi")}
        last
      >
        <label className="hdc-fld">
          <span className="lbl">{t("scholia")}</span>
          <textarea name="notes" rows={3} placeholder={t("scholia_ph")} />
        </label>

        <label className="hdc-chk">
          <input
            type="checkbox"
            name="terms"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
          />
          <i aria-hidden />
          <span>
            {t.rich("apodechomai", {
              terms: (chunks) => (
                <Link href="/oroi-chrisis" target="_blank">
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link href="/aporrito" target="_blank">
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </label>
        {state.fieldErrors?.terms && <p className="hdc-co-ferr">{t("apaiteitai_apodochi")}</p>}

        <button
          type="submit"
          disabled={!terms || pending || blocked != null || modeMissing || quoteBlocked}
          onClick={guardSubmit}
          className="hdc-btn hdc-btn-red hdc-btn-lg hdc-co-submit"
        >
          {submitLabel}
        </button>
        {blocked ? (
          <p className="hdc-co-ferr" role="alert">
            {blocked}
          </p>
        ) : (
          !terms && <p className="hdc-co-note">{t("energopoieitai")}</p>
        )}
      </Step>

      {/* Phones: the total and the next step, always under the thumb. */}
      <div className="hdc-mbar hdc-co-mbar">
        <div className="tt">
          <span>{t("synolo_me_fpa")}</span>
          <b>{total}</b>
        </div>
        {open === "notes" ? (
          <button
            type="submit"
            className="go"
            disabled={!terms || pending || blocked != null || modeMissing || quoteBlocked}
            onClick={guardSubmit}
          >
            {submitLabel}
          </button>
        ) : (
          <button type="button" className="go" onClick={next}>
            {t("synecheia")} →
          </button>
        )}
      </div>
    </form>
  );
}

function Step({
  k,
  n,
  state,
  title,
  titleShort,
  titleNote,
  summary,
  onEdit,
  changeLabel,
  aside,
  hidden,
  last,
  children,
}: {
  k: StepKey;
  n: number;
  state: "done" | "open" | "todo";
  title: string;
  /** A shorter heading for the folded phone row. */
  titleShort?: string;
  titleNote?: string;
  summary: string;
  onEdit: () => void;
  changeLabel: string;
  aside?: React.ReactNode;
  hidden?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={last ? "hdc-step last" : "hdc-step"}
      data-step={k}
      data-state={state}
      hidden={hidden}
      aria-labelledby={`step-${k}`}
    >
      <h3 id={`step-${k}`}>
        <i>{state === "done" ? <span className="ck">✓</span> : null}<span className="nm">{n}</span></i>
        <span className="tl">
          <span className="full">{title}</span>
          {titleShort && <span className="short">{titleShort}</span>}
          {titleNote && <span className="note"> ({titleNote})</span>}
          {summary && <span className="sm">{summary}</span>}
        </span>
        {aside && <small>{aside}</small>}
        <button type="button" className="chg" onClick={onEdit}>
          {changeLabel}
        </button>
      </h3>
      <div className="in">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  defaultValue,
  error,
  help,
  placeholder,
  inputMode,
  minLength,
  invalid,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  help?: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  minLength?: number;
  /**
   * A client-side verdict the browser should enforce as well: set as the
   * input's custom validity, so the phone's «Συνέχεια» stops on this field
   * just as it does on an empty required one.
   */
  invalid?: string;
}) {
  return (
    <label className="hdc-fld">
      <span className="lbl">
        {label}
        {required && <em> *</em>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        // A blank placeholder still lets CSS tell an empty field from a filled
        // one (`:placeholder-shown`), which is what paints a filled field ink.
        placeholder={placeholder ?? " "}
        inputMode={inputMode}
        minLength={minLength}
        ref={(el) => el?.setCustomValidity(invalid ?? "")}
        aria-invalid={error ? true : undefined}
        className={error ? "bad" : undefined}
      />
      {error ? <span className="err">{error}</span> : help ? <small>{help}</small> : null}
    </label>
  );
}
