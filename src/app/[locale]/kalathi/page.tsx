import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { CartActionsRow } from "@/components/cart/CartActionsRow";
import { QuickOrderPaste } from "@/components/cart/QuickOrderPaste";
import { HdcCartCrossSell } from "@/components/cart/hdc/HdcCartCrossSell";
import { HdcCartLine, type HdcCartLineView } from "@/components/cart/hdc/HdcCartLine";
import { HdcCartSummary } from "@/components/cart/hdc/HdcCartSummary";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { Zone } from "@/components/zones/Zone";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCart, getDeliveryPostcode, getMiniCart } from "@/lib/cart/cart";
import { getCartLineExtras, getHdcCrossSell } from "@/lib/cart/hdc-cart";
import { freeShippingProgress } from "@/lib/cart/options";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { formatMoney, formatPrice } from "@/lib/format";
import { displayName, platformTag } from "@/lib/milwaukee/display";
import { parseModel } from "@/lib/milwaukee/model";
import { ahLabel, pdpTitle } from "@/lib/milwaukee/pdp";
import { showsExactQty } from "@/lib/stock-display";

/** Always fresh: a cached cart is a wrong cart. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "cart.Hdc" });
  return {
    title: t("meta_title"),
    robots: { index: false, follow: false },
  };
}

/**
 * The cart — checkout.html, screen 1 (desktop) and the first phone frame.
 *
 * Same cart as before underneath: lines, quantities, the ACS quote from the
 * postcode, the coupon box, quick add by code, the free-shipping rule. What is
 * new is HDC's: the kit ↔ bare swap on a line and the cross-sell by battery
 * platform.
 */
export default async function CartPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("cart.Hdc");
  const { locale } = await params;
  setRequestLocale(locale);

  const postcode = await getDeliveryPostcode();
  const cart = await getCart(locale, postcode);
  const lines = cart?.lines ?? [];
  const isEmpty = lines.length === 0;

  const [extras, crossSell, menuTree, brands, stats, rootCategories, miniCart] =
    await Promise.all([
      isEmpty
        ? Promise.resolve({ swaps: {}, contents: {} } as Awaited<ReturnType<typeof getCartLineExtras>>)
        : getCartLineExtras(locale, lines),
      isEmpty
        ? Promise.resolve({ platforms: [] as string[], items: [] })
        : getHdcCrossSell(locale, lines),
      getMenuTree(locale),
      getTopBrands(locale),
      getCatalogueStats(),
      getRootCategories(locale),
      getMiniCart(locale),
    ]);

  const money = (n: number) => formatMoney(n, locale);

  const lineViews: HdcCartLineView[] = lines.map((line) => {
    const model = parseModel(line.name);
    const kit = extras.contents[line.id];
    const contents: string[] = [];
    if (kit?.batteries)
      contents.push(
        t("kit_batteries", { count: kit.batteries.count, ah: ahLabel(kit.batteries.ah) }),
      );
    if (kit && kit.charger != null) contents.push(t("kit_charger"));
    if (kit?.case) contents.push(kit.case);
    if (!kit && line.modelContent === "bare") contents.push(t("choris_mpataria"));

    const swap = extras.swaps[line.id];
    return {
      id: line.id,
      href: `/proion/${line.slug}`,
      /* The mockup's «… M18 FPD3 — Κιτ»: the clean name with the model root
         (`pdpTitle`, built on `displayName`), and which version it is in
         words. The full code stays in the code line under it. */
      name:
        model && line.modelContent
          ? `${pdpTitle(line.name, line.code2)} — ${line.modelContent === "kit" ? t("kit") : t("sketo")}`
          : displayName(line.name, line.code2),
      codeLine: [line.code2 || line.sku, model?.code, contents.join(", ")]
        .filter(Boolean)
        .join(" · "),
      tag: platformTag(line.name),
      image: line.image,
      quantity: line.quantity,
      inStock: line.inStock,
      availability: line.inStock
        ? showsExactQty(line.availableQty)
          ? t("se_apothema_tem", { qty: line.availableQty })
          : t("se_apothema")
        : t("katopin_paraggelias"),
      overStock: line.overStock ? t("overstock", { qty: line.availableQty }) : null,
      unitPrice: formatPrice(line.unitNetFinal, locale, { vatRate: line.vatRate }),
      unitWas:
        line.discountPercent > 0
          ? formatPrice(line.unitNet, locale, { vatRate: line.vatRate })
          : null,
      lineTotal: money(line.lineGross),
      swap: swap
        ? {
            productId: swap.productId,
            label:
              swap.to === "bare"
                ? t("allagi_se_sketo", { price: money(swap.unitGross) })
                : t("allagi_se_kit", { price: money(swap.unitGross) }),
          }
        : null,
    };
  });

  const totals = cart?.totals;
  const progress = totals ? freeShippingProgress(totals) : null;
  const allAt24 = lines.every((l) => l.vatRate === 24);

  const shippingLabel =
    cart?.shippingMethod === "pickup"
      ? t("ship_pickup")
      : cart?.shippingMethod === "express"
        ? t("ship_express")
        : t("ship_courier");

  const summaryRows = totals
    ? [
        { label: t("proionta_n", { count: totals.itemCount }), value: money(totals.subtotalGross) },
        {
          label: shippingLabel,
          value: totals.shippingGross === 0 ? t("dorean") : money(totals.shippingGross),
          free: totals.shippingGross === 0,
        },
        ...(totals.paymentFeeGross > 0
          ? [{ label: t("epivarynsi"), value: money(totals.paymentFeeGross) }]
          : []),
      ]
    : [];

  const crossTitle = crossSell.platforms.length ? t("xs_title") : t("xs_title_other");
  const crossSubtitle = crossSell.platforms.length
    ? t("xs_sub", { platforms: crossSell.platforms.join(" / ") })
    : t("xs_sub_other");

  return (
    <>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />

      <main id="main" className="hdc-cart-page">
        <Zone id="cart.top" locale={locale} />

        {isEmpty || !totals || !progress ? (
          <div className="hdc-wrap hdc-cart-empty">
            <h1 className="hdc-disp">{t("adeio_titlos")}</h1>
            <p>{t("adeio_keimeno")}</p>
            <div className="acts">
              <Link href="/katalogos" className="hdc-btn hdc-btn-red hdc-btn-lg">
                {t("ston_katalogo")} →
              </Link>
            </div>
            <QuickOrderPaste />
          </div>
        ) : (
          <>
            <div className="hdc-wrap hdc-cart">
              <div className="hdc-cart-main">
                <h1 className="hdc-disp">
                  {t("to_kalathi_sas")}
                  <small>{t("n_proionta", { count: totals.itemCount })}</small>
                </h1>

                <div className="hdc-free" data-reached={progress.reached || undefined}>
                  <div className="row">
                    {progress.reached ? (
                      <>
                        {t("dorean_metaforika")}
                        <span>✓ {t("energo")}</span>
                      </>
                    ) : (
                      <>
                        {t("akomi_gia_dorean", { amount: money(progress.remainingGross) })}
                        <span>{progress.percent}%</span>
                      </>
                    )}
                  </div>
                  <div
                    className="bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress.percent}
                    aria-label={t("dorean_metaforika")}
                  >
                    <i style={{ width: `${progress.percent}%` }} />
                  </div>
                </div>

                <div className="hdc-cart-lines">
                  <div className="th" aria-hidden>
                    <span>{t("th_proion")}</span>
                    <span>{t("th_posotita")}</span>
                    <span className="r">{t("th_timi")}</span>
                    <span className="r">{t("th_synolo")}</span>
                    <span />
                  </div>
                  {lineViews.map((line) => (
                    <HdcCartLine key={line.id} line={line} />
                  ))}
                </div>

                <CartActionsRow />
                <QuickOrderPaste />
              </div>

              <HdcCartSummary
                postcode={postcode}
                rows={summaryRows}
                total={money(totals.totalGross)}
                vatLine={
                  allAt24
                    ? t("periechei_fpa_24", { amount: money(totals.vatAmount) })
                    : t("periechei_fpa", { amount: money(totals.vatAmount) })
                }
              />
            </div>

            <Zone id="cart.middle" locale={locale} />

            <HdcCartCrossSell
              title={crossTitle}
              subtitle={crossSubtitle}
              items={crossSell.items.map((item) => ({
                id: item.id,
                href: `/proion/${item.slug}`,
                name: displayName(item.name, item.code),
                image: item.image,
                price: money(item.priceGross),
              }))}
            />

            {/* Phones: the total and the way on, always under the thumb. */}
            <div className="hdc-mbar">
              <div className="tt">
                <span>{t("synolo_me_fpa")}</span>
                <b>{money(totals.totalGross)}</b>
              </div>
              <Link href="/checkout" className="go">
                {t("oloklirosi")} →
              </Link>
            </div>
          </>
        )}
        <Zone id="cart.below" locale={locale} />
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
