import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { BestSellers } from "@/components/home/BestSellers";
import { HdcHero, type HeroSlide } from "@/components/home/HdcHero";
import { HomeCategories } from "@/components/home/HomeCategories";
import { NewArrivalsBand } from "@/components/home/NewArrivalsBand";
import { NewsletterBand } from "@/components/home/NewsletterBand";
import { PackoutBand } from "@/components/home/PackoutBand";
import { PlatformBand } from "@/components/home/PlatformBand";
import { StoreBand } from "@/components/home/StoreBand";
import { Zone } from "@/components/zones/Zone";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getFeaturedProducts,
  getHomeCategorySources,
  getHomeNewArrivals,
  getMenuTree,
  getProductsByCode2,
  getRootCategories,
  getTopBrands,
  type ProductCardData,
} from "@/lib/catalog/queries";
import { formatPrice } from "@/lib/format";
import { drillsHref, resolveHomeCategories } from "@/lib/hdc-home";
import { discountedNet, offerBadgeFor } from "@/lib/offers/badges";

/**
 * The HDC home page — docs/design/mockups/home.html, section by section:
 * hero, platforms, categories, best sellers, PACKOUT, new arrivals, the store,
 * newsletter.
 *
 * Every product, price and count is read from the local catalogue projection.
 * What is fixed copy is the mockup's own copy (in the message files), and the
 * photos are Milwaukee's.
 *
 * The CMS zones stay mounted where they fit the new layout; an empty zone
 * renders nothing, so the page looks exactly like the mockup until someone
 * fills one.
 */
/*
 * Dynamic, not ISR: the header renders the visitor's own cart from the session
 * cookie, and the store band says whether the shop is open right now. The
 * catalogue reads go through the shared cache, so the cost is small.
 */
export const dynamic = "force-dynamic";

/** The mockup's hero slide: the M18 FPD3, bare tool and kit. */
const HERO_BARE = "4933479859";
const HERO_KIT = "4933479860";
const HERO_IMAGE =
  "https://www.milwaukeetool.gr/wp-content/uploads/2023/05/M18_FPD3-502X-App_21.jpg";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home.HdcHero");

  const [
    rootCategories,
    menuTree,
    brands,
    stats,
    miniCart,
    heroProducts,
    bestSellers,
    newArrivals,
    categorySources,
  ] = await Promise.all([
    getRootCategories(locale),
    getMenuTree(locale),
    getTopBrands(locale),
    getCatalogueStats(),
    getMiniCart(locale),
    getProductsByCode2(locale, [HERO_BARE, HERO_KIT]),
    /*
     * Best sellers. A real "most sold" ranking needs HDCtool's sales endpoint,
     * which the eshop does not call yet; this is the same stand-in the old
     * home used (in stock, spread across categories), limited to products
     * with a photo.
     */
    getFeaturedProducts(locale, 5, 2, true),
    getHomeNewArrivals(locale, 4),
    getHomeCategorySources(),
  ]);

  const categoryCards = resolveHomeCategories(categorySources);

  /* The price the cart would charge, VAT included — campaigns applied. */
  const charged = async (product: ProductCardData | undefined) => {
    if (!product || product.priceNet == null) return null;
    const offer = await offerBadgeFor({ ...product, unitNet: product.priceNet }, locale);
    return formatPrice(discountedNet(product.priceNet, offer?.discountPercent ?? 0), locale, {
      vatRate: product.vatRate,
    });
  };
  const bare = heroProducts.find((p) => p.sku === HERO_BARE);
  const kit = heroProducts.find((p) => p.sku === HERO_KIT);
  const heroProduct = bare ?? kit;
  const [barePrice, kitPrice] = await Promise.all([charged(bare), charged(kit)]);

  const slides: HeroSlide[] = [
    {
      id: "m18-fpd3",
      image: HERO_IMAGE,
      tag: "M18 FUEL™",
      title: t("titlos"),
      text: t("keimeno"),
      price: barePrice ? t("apo", { price: barePrice }) : undefined,
      priceNote: barePrice
        ? [t("me_fpa_sketo"), kitPrice ? t("kit", { price: kitPrice }) : null]
            .filter(Boolean)
            .join(" · ")
        : undefined,
      primary: {
        href: heroProduct ? `/proion/${heroProduct.slug}` : "/anazitisi?q=FPD3",
        label: t("deite_to"),
      },
      secondary: { href: drillsHref(), label: t("ola_ta_drapana") },
    },
  ];

  return (
    <>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />

      <main id="main">
        <Zone id="home.top" locale={locale} />
        <HdcHero
          slides={slides}
          labels={{
            region: t("perioxi"),
            prev: t("proigoumeni"),
            next: t("epomeni"),
            slide: t("diafaneia"),
          }}
        />
        <PlatformBand />
        <HomeCategories cards={categoryCards} />
        <Zone id="home.belowCategories" locale={locale} />
        <BestSellers products={bestSellers} />
        <PackoutBand href="/packout" />
        <Zone id="home.band" locale={locale} />
        <NewArrivalsBand products={newArrivals.products} />
        <StoreBand />
        <NewsletterBand />
        <Zone id="home.beforeFooter" locale={locale} />
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
