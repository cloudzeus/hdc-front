import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import {
  CheckoutForm,
  type DestinationQuoteStatus,
  type ShippingOption,
} from "@/components/checkout/CheckoutForm";
import { HdcCheckoutHeader } from "@/components/checkout/HdcCheckoutHeader";
import {
  SplitCheckoutProvider,
  SplitSummaryBody,
  SplitSummaryTotal,
} from "@/components/checkout/SplitCheckout";
import { checkoutBreakdown } from "@/lib/requests/checkout-breakdown";
import { getViewer } from "@/lib/account/session";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import { computeTotals, getCart, getDeliveryPostcode } from "@/lib/cart/cart";
import {
  shippingMethodsFor,
  type AnyShippingMethodId,
  type CartTotals,
} from "@/lib/cart/options";
import { orderAvailability } from "@/lib/catalog/availability";
import { formatMoney } from "@/lib/format";
import { displayName } from "@/lib/milwaukee/display";
import { parseModel } from "@/lib/milwaukee/model";
import { isVivaConfigured } from "@/lib/payment/viva";
import { splitCart } from "@/lib/requests/model";
import { countryName } from "@/lib/shipping/countries";
import { readDestination } from "@/lib/shipping/destination-cookie";
import { isInternationalShippingEnabled } from "@/lib/shipping/flag";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "checkout.Hdc" });
  return {
    title: t("meta_title"),
    robots: { index: false, follow: false },
  };
}

/**
 * Checkout — checkout.html, screen 2, and the second phone frame.
 *
 * One page with no menu: the site chrome is replaced by `HdcCheckoutHeader`
 * on this route only (the chrome is mounted per page, so this page simply does
 * not mount it), and there is no footer. The customer does not leave before
 * paying — except back to the cart, which the header offers.
 *
 * The postcode the cart quoted (a cookie) or the signed-in customer's saved
 * address prices the three pickup tiles and the summary; typing another Τ.Κ.
 * in the form re-prices both.
 */
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("checkout.Hdc");
  const { locale } = await params;
  setRequestLocale(locale);

  // Somebody with an account is not offered another one.
  const [viewer, savedPostcode] = await Promise.all([getViewer(), getDeliveryPostcode()]);

  /*
   * What we already know about them — the account and its default address —
   * read here so the fields render filled on the first paint. Null for a guest.
   */
  const defaultAddress = viewer.user
    ? await prisma.customerAddress.findFirst({
        where: { customerId: viewer.user.id },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      })
    : null;

  const prefill = viewer.user
    ? {
        // The recipient may differ from the account holder, so the address's
        // own name wins where it has one.
        firstName: defaultAddress?.firstName || viewer.user.firstName,
        lastName: defaultAddress?.lastName || viewer.user.lastName,
        email: viewer.user.email,
        phone: defaultAddress?.phone || viewer.user.phone || "",
        shipLine1: defaultAddress?.line1 ?? "",
        shipLine2: defaultAddress?.line2 ?? "",
        shipCity: defaultAddress?.city ?? "",
        shipPostcode: defaultAddress?.postcode ?? "",
        shipRegion: defaultAddress?.region ?? "",
        shipAdminRegion: defaultAddress?.adminRegion ?? "",
      }
    : null;

  const savedAddressPostcode = /^\d{5}$/.test(prefill?.shipPostcode ?? "")
    ? prefill!.shipPostcode
    : null;
  /*
   * Delivery abroad (INTERNATIONAL_SHIPPING_ENABLED only): the country, Τ.Κ.
   * and city last chosen, so the tiles and the summary are priced for that
   * place. Null with the flag off or for Greece — the page is then exactly
   * what it was.
   */
  const international = isInternationalShippingEnabled();
  const destination = international ? await readDestination() : null;
  const abroadTo = destination ? { country: destination.country, city: destination.city } : undefined;

  const postcode = destination ? destination.postcode || null : (savedPostcode ?? savedAddressPostcode);

  const cart = await getCart(locale, postcode, abroadTo);

  // An empty cart has nothing to check out; bouncing back is kinder than an
  // empty form that fails on submit.
  if (!cart || cart.lines.length === 0) redirect("/kalathi");
  /* One line from the supplier sends the whole order in 3–5 working days. */
  const supplierOrder = orderAvailability(cart.lines.map((l) => l.availability)) === "supplier";

  const totals = cart.totals;
  /* Back-order requests: shapes the form; the action decides again on submit. */
  const split = splitCart(cart.lines);
  const requestKind = split.kind;
  const money = (n: number) => formatMoney(n, locale);
  /*
   * A cart with back-order lines: what each choice costs, priced here by the
   * same `computeTotals` `placeOrder` charges with — the in-stock lines alone
   * for «split», with their own postage and threshold, for the postcode the
   * cart remembers. Null for an ordinary cart, whose page is what it was.
   */
  const breakdown = await checkoutBreakdown({
    lines: cart.lines,
    cartTotals: totals,
    shippingMethod: cart.shippingMethod,
    paymentMethod: cart.paymentMethod,
    postcode,
    destination: abroadTo,
  });

  /*
   * A price on every tile. The selected method's totals are the cart's own;
   * the other paid method is priced by the same `computeTotals`, for the same
   * postcode — never a second formula. Without a postcode the courier figure
   * would only be a guess, so the tile asks for one instead (unless free).
   */
  const totalsFor = async (id: AnyShippingMethodId): Promise<CartTotals> =>
    id === cart.shippingMethod
      ? totals
      : computeTotals(cart.lines, id, cart.paymentMethod, postcode, abroadTo);
  /* Only the methods the destination offers are priced — no ACS call for Italy. */
  const offered = destination ? shippingMethodsFor(destination.country) : null;
  const [courier, express, dhl] = await Promise.all([
    !offered || offered.some((m) => m.id === "courier") ? totalsFor("courier") : null,
    !offered ? totalsFor("express") : null,
    offered?.some((m) => m.id === "dhl") ? totalsFor("dhl") : null,
  ]);
  /* «split»: each tile priced for the in-stock lines alone — what ships now. */
  const nowFor = (id: AnyShippingMethodId) =>
    computeTotals(split.ready, id, cart.paymentMethod, postcode, abroadTo);
  const [courierNow, expressNow, dhlNow] =
    requestKind === "mixed"
      ? await Promise.all([courier ? nowFor("courier") : null, express ? nowFor("express") : null, dhl ? nowFor("dhl") : null])
      : [null, null, null];
  /* The delivery quote abroad, as the form needs to judge it. */
  const abroadTotals = destination ? (dhl ?? courier) : null;
  const quoteStatus: DestinationQuoteStatus | null = !abroadTotals
    ? null
    : abroadTotals.quoteUnavailable
      ? "unavailable"
      : abroadTotals.refusal
        ? abroadTotals.refusal
        : abroadTotals.unserviceable
          ? "unserviceable"
          : abroadTotals.postage
            ? "ok"
            : "pending";

  // A postcode ACS does not serve gets no price on a courier tile — not even «ΔΩΡΕΑΝ».
  const tilePrice = (method: CartTotals) =>
    method.unserviceable
      ? { price: t("ship_unserviceable"), free: false }
      : method.quoteUnavailable
        ? { price: t("quote_unavailable_short"), free: false }
        : method.quotePending
          ? { price: null, free: false }
      : method.shippingGross === 0
        ? { price: t("dorean"), free: true }
        : postcode
          ? { price: money(method.shippingGross), free: false }
          : { price: null, free: false };

  const tiles = (
    courier: CartTotals | null,
    express: CartTotals | null,
    dhl: CartTotals | null,
  ): ShippingOption[] => [
    ...(courier
      ? [{ id: "courier", title: "ACS COURIER", label: "ACS Courier", meta: t(supplierOrder ? "ship_courier_meta_3_5" : "ship_courier_meta"), ...tilePrice(courier) }]
      : []),
    ...(express
      ? [{ id: "express", title: "ACS EXPRESS", label: "ACS Express", meta: t(supplierOrder ? "ship_express_meta_3_5" : "ship_express_meta"), ...tilePrice(express) }]
      : []),
    ...(dhl
      ? [
          {
            id: "dhl",
            title: "DHL EXPRESS",
            label: "DHL Express",
            meta: dhl.postage
              ? t("ship_dhl_meta", { eta: dhl.postage.etaDays })
              : t("ship_dhl_meta_plain"),
            ...tilePrice(dhl),
          },
        ]
      : []),
    {
      id: "pickup",
      title: t("ship_pickup_title"),
      label: t("ship_pickup_row"),
      meta: t(supplierOrder ? "ship_pickup_meta_3_5" : "ship_pickup_meta"),
      price: t("dorean"),
      free: true,
    },
  ];
  const shippingOptions = tiles(courier, express, dhl);
  const splitShippingOptions = requestKind === "mixed" ? tiles(courierNow, expressNow, dhlNow) : null;

  const shippingRowLabel =
    cart.shippingMethod === "pickup"
      ? t("ship_pickup_row")
      : destination
        ? `${cart.shippingMethod === "dhl" ? "DHL Express" : "ACS Courier"} · ${countryName(destination.country, locale)}${postcode ? ` ${postcode}` : ""}`
        : `${cart.shippingMethod === "express" ? "ACS Express" : "ACS Courier"}${postcode ? ` · ${postcode}` : ""}`;

  const allAt24 = cart.lines.every((l) => l.vatRate === 24);
  const vatLine = allAt24
    ? t("periechei_fpa_24", { amount: money(totals.vatAmount) })
    : t("periechei_fpa", { amount: money(totals.vatAmount) });

  const miniName = (name: string, code2: string) => {
    const model = parseModel(name);
    if (!model) return displayName(name, code2);
    return `${model.code} — ${model.content === "kit" ? t("kit") : t("sketo")}`;
  };

  /* Back-order lines: grouped, «Πληρωτέο τώρα» apart from «Σε αίτημα (ενδεικτικά)». */
  const splitBody = breakdown ? (
    <SplitSummaryBody
      locale={locale}
      lines={cart.lines.map((line) => ({
        id: line.id,
        name: miniName(line.name, line.code2),
        image: line.image,
        quantity: line.quantity,
        lineGross: line.lineGross,
      }))}
      shippingRowLabel={shippingRowLabel}
      nowAllAt24={split.ready.every((l) => l.vatRate === 24)}
    />
  ) : null;

  const summaryBody = splitBody ?? (
    <>
      <ul className="hdc-mini">
        {cart.lines.map((line) => (
          <li key={line.id}>
            <span className="im">
              {line.image && <Image src={line.image} alt="" width={64} height={64} sizes="64px" />}
              <em>{line.quantity}</em>
            </span>
            <b>
              {miniName(line.name, line.code2)}
            </b>
            <span className="p">{money(line.lineGross)}</span>
          </li>
        ))}
      </ul>
      <dl>
        <div>
          <dt>{t("proionta")}</dt>
          <dd>{money(totals.subtotalGross)}</dd>
        </div>
        <div>
          <dt>{shippingRowLabel}</dt>
          <dd
            className={
              !totals.unserviceable && !totals.quoteUnavailable && !totals.quotePending && totals.shippingGross === 0
                ? "fr"
                : undefined
            }
          >
            {totals.unserviceable
              ? t("ship_unserviceable")
              : totals.quoteUnavailable
                ? t("quote_unavailable_short")
                : totals.quotePending
                  ? t("timi_apo_dhl")
                  : totals.shippingGross === 0
                ? t("dorean")
                : money(totals.shippingGross)}
          </dd>
        </div>
        {totals.paymentFeeGross > 0 && (
          <div>
            <dt>{t("epivarynsi")}</dt>
            <dd>{money(totals.paymentFeeGross)}</dd>
          </div>
        )}
      </dl>
      <div className="tot">
        <b>{t("synolo")}</b>
        <span>{money(totals.totalGross)}</span>
      </div>
      <p className="vat">{vatLine}</p>
      <Link href="/kalathi" className="edit">
        {t("epexergasia_kalathiou")}
      </Link>
    </>
  );

  return (
    <>
      <HdcCheckoutHeader />

      <SplitCheckoutProvider breakdown={breakdown}>
      <main id="main" className="hdc-co-page">
        {/* Phones: the summary folds into one bar above the steps. */}
        <details className="hdc-co-msum">
          <summary>
            <span>
              {t("synopsi_n", { count: totals.itemCount })} <span aria-hidden>⌄</span>
            </span>
            {breakdown ? (
              <SplitSummaryTotal locale={locale} fallback={totals.totalGross} />
            ) : (
              <b>{money(totals.totalGross)}</b>
            )}
          </summary>
          <div className="hdc-sum-body">{summaryBody}</div>
        </details>

        <div className="hdc-wrap hdc-co">
          <div className="hdc-co-main">
            {!isVivaConfigured() && <p className="hdc-co-warn">{t("viva_off")}</p>}
            <CheckoutForm
              locale={locale}
              postcode={postcode ?? ""}
              unserviceablePostcode={!destination && courier?.unserviceable ? postcode : null}
              prefill={prefill}
              signedIn={viewer.user != null}
              shippingMethod={cart.shippingMethod}
              paymentMethod={cart.paymentMethod}
              shippingOptions={shippingOptions}
              splitShippingOptions={splitShippingOptions}
              total={money(totals.totalGross)}
              requestKind={requestKind}
              international={international}
              destination={destination}
              quoteStatus={quoteStatus}
            />
          </div>

          <aside className="hdc-sum hdc-co-sum">
            <h2 className="hdc-disp">{t("i_paraggelia_sas")}</h2>
            <div className="in hdc-sum-body">{summaryBody}</div>
          </aside>
        </div>
      </main>
      </SplitCheckoutProvider>
    </>
  );
}
