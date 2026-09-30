import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { CheckoutForm, type ShippingOption } from "@/components/checkout/CheckoutForm";
import { HdcCheckoutHeader } from "@/components/checkout/HdcCheckoutHeader";
import { getViewer } from "@/lib/account/session";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import { computeTotals, getCart, getDeliveryPostcode } from "@/lib/cart/cart";
import type { CartTotals, ShippingMethodId } from "@/lib/cart/options";
import { orderAvailability } from "@/lib/catalog/availability";
import { formatMoney } from "@/lib/format";
import { displayName } from "@/lib/milwaukee/display";
import { parseModel } from "@/lib/milwaukee/model";
import { isVivaConfigured } from "@/lib/payment/viva";

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
  const postcode = savedPostcode ?? savedAddressPostcode;

  const cart = await getCart(locale, postcode);

  // An empty cart has nothing to check out; bouncing back is kinder than an
  // empty form that fails on submit.
  if (!cart || cart.lines.length === 0) redirect("/kalathi");
  /* One line from the supplier sends the whole order in 3–5 working days. */
  const supplierOrder = orderAvailability(cart.lines.map((l) => l.availability)) === "supplier";

  const totals = cart.totals;
  const money = (n: number) => formatMoney(n, locale);

  /*
   * A price on every tile. The selected method's totals are the cart's own;
   * the other paid method is priced by the same `computeTotals`, for the same
   * postcode — never a second formula. Without a postcode the courier figure
   * would only be a guess, so the tile asks for one instead (unless free).
   */
  const totalsFor = async (id: ShippingMethodId): Promise<CartTotals> =>
    id === cart.shippingMethod
      ? totals
      : computeTotals(cart.lines, id, cart.paymentMethod, postcode);
  const [courier, express] = await Promise.all([totalsFor("courier"), totalsFor("express")]);

  const tilePrice = (method: CartTotals) =>
    method.shippingGross === 0
      ? { price: t("dorean"), free: true }
      : postcode
        ? { price: money(method.shippingGross), free: false }
        : { price: null, free: false };

  const shippingOptions: ShippingOption[] = [
    { id: "courier", title: "ACS COURIER", label: "ACS Courier", meta: t(supplierOrder ? "ship_courier_meta_3_5" : "ship_courier_meta"), ...tilePrice(courier) },
    { id: "express", title: "ACS EXPRESS", label: "ACS Express", meta: t(supplierOrder ? "ship_express_meta_3_5" : "ship_express_meta"), ...tilePrice(express) },
    {
      id: "pickup",
      title: t("ship_pickup_title"),
      label: t("ship_pickup_row"),
      meta: t(supplierOrder ? "ship_pickup_meta_3_5" : "ship_pickup_meta"),
      price: t("dorean"),
      free: true,
    },
  ];

  const shippingRowLabel =
    cart.shippingMethod === "pickup"
      ? t("ship_pickup_row")
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

  const summaryBody = (
    <>
      <ul className="hdc-mini">
        {cart.lines.map((line) => (
          <li key={line.id}>
            <span className="im">
              {line.image && <Image src={line.image} alt="" width={64} height={64} sizes="64px" />}
              <em>{line.quantity}</em>
            </span>
            <b>{miniName(line.name, line.code2)}</b>
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
          <dd className={totals.shippingGross === 0 ? "fr" : undefined}>
            {totals.shippingGross === 0 ? t("dorean") : money(totals.shippingGross)}
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

      <main id="main" className="hdc-co-page">
        {/* Phones: the summary folds into one bar above the steps. */}
        <details className="hdc-co-msum">
          <summary>
            <span>
              {t("synopsi_n", { count: totals.itemCount })} <span aria-hidden>⌄</span>
            </span>
            <b>{money(totals.totalGross)}</b>
          </summary>
          <div className="hdc-sum-body">{summaryBody}</div>
        </details>

        <div className="hdc-wrap hdc-co">
          <div className="hdc-co-main">
            {!isVivaConfigured() && <p className="hdc-co-warn">{t("viva_off")}</p>}
            <CheckoutForm
              locale={locale}
              postcode={postcode ?? ""}
              prefill={prefill}
              signedIn={viewer.user != null}
              shippingMethod={cart.shippingMethod}
              paymentMethod={cart.paymentMethod}
              shippingOptions={shippingOptions}
              total={money(totals.totalGross)}
            />
          </div>

          <aside className="hdc-sum hdc-co-sum">
            <h2 className="hdc-disp">{t("i_paraggelia_sas")}</h2>
            <div className="in hdc-sum-body">{summaryBody}</div>
          </aside>
        </div>
      </main>
    </>
  );
}
