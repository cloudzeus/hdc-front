import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { FavouriteButton } from "@/components/product/FavouriteButton";
import { HdcCompareCheckbox } from "@/components/product/HdcCompareCheckbox";
import { HdcQuickViewButton } from "@/components/product/HdcQuickViewButton";
import { Link } from "@/i18n/navigation";
import { favouriteIds } from "@/lib/account/favourite-ids";
import type { ProductCardData } from "@/lib/catalog/queries";
import { formatPrice } from "@/lib/format";
import { displayName, platformTag } from "@/lib/milwaukee/display";
import { parseModel } from "@/lib/milwaukee/model";
import { discountedNet, offerBadgeFor } from "@/lib/offers/badges";
import { showsExactQty } from "@/lib/stock-display";

/**
 * The HDC product card — a SERVER component (mockups: home.html `.card`,
 * design-system.html "ΚΑΡΤΑ ΠΡΟΪΟΝΤΟΣ").
 *
 * White square image, grey info band: a clean name without the article number,
 * the manufacturer code on its own line, the VAT-inclusive price, availability
 * in colour AND words, and one red button. No star rating — an empty row of
 * stars says "nobody bought this", which is worse than nothing.
 *
 * The slanted tag names the battery platform ("M18 FUEL"), read from the
 * product name. `variant="new"` is the new-arrivals band's card: a red "ΝΕΟ"
 * tag, no border, no favourite and no availability line, as in the mockup.
 *
 * The price is the one the cart charges: the same `discountedNet` over the same
 * campaign lookup the Kolleris card used, so a campaign cannot show one price
 * here and charge another.
 */
export async function HdcProductCard({
  product,
  variant = "default",
  quickView = false,
  compare,
}: {
  product: ProductCardData;
  variant?: "default" | "new";
  /** The 👁 button (listing pages, which mount a `QuickViewProvider`). */
  quickView?: boolean;
  /** «Σύγκριση»: whether ticked, and whether it may be ticked at all. */
  compare?: { selected: boolean; disabled: boolean };
}) {
  const locale = await getLocale();
  const t = await getTranslations("product.HdcProductCard");
  const isNew = variant === "new";

  const offer = await offerBadgeFor({ ...product, unitNet: product.priceNet }, locale);
  const favourite = isNew ? false : (await favouriteIds()).has(product.id);
  const ctx = { vatRate: product.vatRate };
  const finalNet =
    product.priceNet == null ? null : discountedNet(product.priceNet, offer?.discountPercent ?? 0);
  const discounted = product.priceNet != null && (offer?.discountPercent ?? 0) > 0;

  const name = displayName(product.name, product.sku);
  const tag = isNew ? t("neo") : platformTag(product.name);

  /* What is in the box, when the model code says so unambiguously. */
  const model = parseModel(product.name);
  const content =
    model?.content === "bare"
      ? t("choris_mpataria")
      : model?.kit
        ? t("kit", { count: model.kit.batteries, ah: model.kit.ah.toFixed(1) })
        : null;

  const href = `/proion/${product.slug}`;

  return (
    <article className={`hdc-card${isNew ? " hdc-card--flat" : ""}`}>
      <div className="hdc-card-img">
        {tag && (
          <span
            className="hdc-slant hdc-card-tag"
            style={{
              background: isNew ? "var(--hdc-red)" : "var(--hdc-ink)",
              color: "#fff",
            }}
          >
            {tag}
          </span>
        )}
        {/* A second tag under the platform, as in the mockup's ONE-KEY cards. */}
        {!isNew && product.oneKey && (
          <span className="hdc-slant hdc-card-tag hdc-card-tag--k1">ONE-KEY</span>
        )}
        {!isNew && (
          <FavouriteButton productId={product.id} initial={favourite} className="hdc-card-fav" />
        )}
        {quickView && <HdcQuickViewButton slug={product.slug} label={t("grigori_provoli")} />}
        <Link href={href} className="hdc-card-media" prefetch={false} tabIndex={-1} aria-hidden>
          {product.image ? (
            <Image
              src={product.image}
              alt=""
              width={400}
              height={400}
              sizes="(max-width: 767px) 45vw, 260px"
            />
          ) : (
            <span className="hdc-card-noimg">{t("choris_eikona")}</span>
          )}
        </Link>
      </div>

      <div className="hdc-card-body">
        {/* Two lines, as in the mockup; the full name is in the tooltip and on
            the product page. */}
        <Link href={href} className="hdc-card-name" prefetch={false} title={name}>
          {name}
        </Link>
        <p className="hdc-card-code">
          {product.sku}
          {content && ` · ${content}`}
        </p>
        <p className="hdc-card-price">
          {finalNet != null ? formatPrice(finalNet, locale, ctx) : "—"}
          {discounted && (
            <span className="hdc-card-was">{formatPrice(product.priceNet!, locale, ctx)}</span>
          )}
        </p>
        {!isNew && (
          <p
            className={`hdc-card-avail ${product.inStock ? "hdc-card-avail--ok" : "hdc-card-avail--wait"}`}
          >
            ●{" "}
            {product.inStock
              ? showsExactQty(product.qty)
                ? t("se_apothema_tem", { qty: product.qty })
                : t("se_apothema")
              : t("paradosi_1_3")}
          </p>
        )}
        {compare && (
          <HdcCompareCheckbox
            slug={product.slug}
            selected={compare.selected}
            disabled={compare.disabled}
            label={t("sygkrisi")}
          />
        )}
        <AddToCartButton
          productId={product.id}
          disabled={finalNet == null}
          className="hdc-card-add"
        />
      </div>
    </article>
  );
}
