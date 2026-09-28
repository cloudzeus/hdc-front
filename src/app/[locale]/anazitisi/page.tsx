import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { alternatesFor } from "@/lib/seo/urls";
import Image from "next/image";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { CompareTray } from "@/components/compare/CompareTray";
import { HdcSearchBand } from "@/components/plp/hdc/HdcBands";
import { HdcListing } from "@/components/plp/hdc/HdcListing";
import { QuickViewProvider } from "@/components/product/QuickViewProvider";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { platformsPresent } from "@/lib/catalog/hdc-filters";
import { getPlpData, getPlpSummary, parsePlpParams } from "@/lib/catalog/plp";
import { findByExactCode } from "@/lib/catalog/suggest";
import { SUGGEST_MIN_LENGTH } from "@/lib/catalog/suggest-options";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import {
  COMPARE_MAX,
  getCompareSelection,
  getCompareTray,
} from "@/lib/compare/compare";
import { formatPrice } from "@/lib/format";
import { upGreek } from "@/lib/greek";
import { displayName } from "@/lib/milwaukee/display";
import { SHOP } from "@/config/shop";
import { showsExactQty } from "@/lib/stock-display";
import { Zone } from "@/components/zones/Zone";

type PageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "anazitisi.page" });
  const raw = await searchParams;
  const q = (Array.isArray(raw.q) ? raw.q[0] : raw.q)?.trim() ?? "";
  return {
    /* Canonical στη ΔΙΚΗ της διεύθυνση. Χωρίς αυτό η σελίδα κληρονομεί το
       canonical της ρίζας, δηλαδή δηλώνει ότι ΕΙΝΑΙ η αρχική — και το
       `noindex` δεν αναιρεί μια λάθος δήλωση ταυτότητας, απλώς την κρύβει. */
    alternates: alternatesFor("/anazitisi", locale),
    title: q ? t("anazitisi", { q }) : t("anazitisi_titlos"),
    // A results page is a view over the catalogue, not a page that should
    // compete in search with the products it lists.
    robots: { index: false, follow: true },
  };
}

/**
 * Search results (search.html section 2).
 *
 * Deliberately the PLP engine with `q` as the scope instead of a category.
 * `resolveCategoryScope(undefined)` returns an empty scope, so `getPlpData`
 * already filters the whole catalogue by query — and every facet count it
 * returns is computed against the RESULT SET rather than the catalogue, which
 * is exactly what the mockup asks for and what a second implementation would
 * have got subtly wrong. The layout is the category page's, under a band that
 * names the query.
 *
 * What is genuinely new here is the exact-code band: someone pasting a part
 * number wants that part, not position nine of 340.
 */
export default async function SearchPage({ params, searchParams }: PageProps) {
  const t = await getTranslations("anazitisi.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const raw = await searchParams;
  const query = (Array.isArray(raw.q) ? raw.q[0] : raw.q)?.trim() ?? "";
  const scopeSlug =
    (Array.isArray(raw.cat) ? raw.cat[0] : raw.cat)?.trim() || undefined;

  const plpParams = parsePlpParams(raw, {
    categorySlug: scopeSlug,
    grossPrices: true,
    cumulative: true,
  });
  const searchable = query.length >= SUGGEST_MIN_LENGTH;

  const [
    data,
    summary,
    exact,
    menuTree,
    brands,
    stats,
    rootCategories,
    miniCart,
    compareSelection,
    compareTray,
  ] = await Promise.all([
    searchable ? getPlpData(plpParams, locale) : null,
    searchable ? getPlpSummary({ categorySlug: scopeSlug, q: plpParams.q }, locale) : null,
    searchable ? findByExactCode(query, locale) : null,
    getMenuTree(locale),
    getTopBrands(locale),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
    getCompareSelection(),
    getCompareTray(locale),
  ]);

  const compareStateFor = (slug: string, scopeKey?: string | null) => {
    const selected = compareSelection.slugs.includes(slug);
    return {
      selected,
      disabled:
        !selected &&
        (compareSelection.slugs.length >= COMPARE_MAX ||
          (compareSelection.scopeKey != null &&
            scopeKey !== compareSelection.scopeKey)),
    };
  };

  /* The band describes what the query found, before any filter: products,
     distinct models (bare tool and kits of one model count once), platforms. */
  const found = summary?.platforms.all ?? 0;

  return (
    <QuickViewProvider locale={locale}>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />

      <main id="main" className="hdc-plp-page">
        <Zone id="search.top" locale={locale} />

        {searchable ? (
          <HdcSearchBand
            query={query}
            total={found}
            models={summary?.models ?? 0}
            platforms={summary ? platformsPresent(summary.platforms) : []}
          />
        ) : (
          <section className="hdc-rband">
            <div className="hdc-wrap">
              <h1 className="hdc-disp">{upGreek(t("anazitisi"))}</h1>
              <p className="hdc-rband-m">
                {t("grapste_toylachiston")} {SUGGEST_MIN_LENGTH}{" "}
                {t("charaktires_kodiko_onoma_proiontos_i")}
              </p>
            </div>
          </section>
        )}

        <Zone id="search.middle" locale={locale} />

        {/* Exact code — its own band, above everything. */}
        {exact && (
          <section className="hdc-wrap hdc-exact">
            <p className="hdc-exact-k">{upGreek(t("akrivis_kodikos"))}</p>
            <div className="hdc-exact-row">
              <Link href={`/proion/${exact.slug}`} className="hdc-exact-img">
                {exact.image ? (
                  <Image src={exact.image} alt="" width={120} height={120} />
                ) : (
                  <span>—</span>
                )}
              </Link>
              <div className="hdc-exact-main">
                <Link href={`/proion/${exact.slug}`} className="hdc-exact-name">
                  {displayName(exact.name, exact.sku)}
                </Link>
                <p className="hdc-exact-code">
                  {exact.sku}
                  {exact.mpn && exact.mpn !== exact.sku && ` · ${exact.mpn}`}
                </p>
              </div>
              <div className="hdc-exact-price">
                <p>
                  {exact.priceNet != null
                    ? formatPrice(exact.priceNet, locale, {
                        vatRate: exact.vatRate,
                      })
                    : "—"}
                </p>
                <p
                  className={
                    exact.inStock ? "hdc-card-avail--ok" : "hdc-card-avail--wait"
                  }
                >
                  ●{" "}
                  {exact.inStock
                    ? showsExactQty(exact.qty)
                      ? `${exact.qty} ${t("tem")}`
                      : t("diathesimo")
                    : t("katopin")}
                </p>
              </div>
              <AddToCartButton
                productId={exact.id}
                disabled={exact.priceNet == null}
                className="hdc-btn hdc-btn-red"
              />
            </div>
          </section>
        )}

        {data && found > 0 ? (
          <HdcListing
            variant="search"
            locale={locale}
            basePath="/anazitisi"
            params={raw}
            data={data}
            compareStateFor={compareStateFor}
          />
        ) : (
          searchable && <NoResults query={query} />
        )}
        <Zone id="search.bottom" locale={locale} />
      </main>

      <SiteFooter categories={rootCategories} />
      <CompareTray tray={compareTray} />
    </QuickViewProvider>
  );
}

/**
 * Zero results.
 *
 * A dead end with "0 αποτελέσματα" is the worst screen in a shop. Every route
 * out of it is concrete: what to try, where to browse, and a phone number.
 */
function NoResults({ query }: { query: string }) {
  const t = useTranslations("anazitisi.page");
  const tips = [
    {
      title: t("dokimaste_ton_kodiko_toy_kataskeyasti"),
      body: t("psachnoyme_se_kodiko_kolleris_kodiko"),
    },
    {
      title: t("ligoteres_lexeis"),
      body: t("trypani_mpeton_8_trypani_8"),
    },
    {
      title: t("dokimaste_latinika_i_ellinika"),
      body: t("ta_brands_einai_katachorimena_latinika"),
    },
    {
      title: t("psaxte_ston_katalogo"),
      body: t("23_katigories_me_filtra_se"),
    },
  ];

  return (
    <section className="hdc-wrap hdc-zero">
      <h2 className="hdc-disp">
        {upGreek(t("den_vrethike_kati_gia", { query: query }))}
      </h2>
      <p>{t("pithanon_na_to_echoyme_kai")}</p>
      <ul>
        {tips.map((tip) => (
          <li key={tip.title}>
            <b>{tip.title}</b>
            <span>{tip.body}</span>
          </li>
        ))}
      </ul>
      <div className="hdc-zero-actions">
        <Link href="/katalogos" className="hdc-btn hdc-btn-red">
          {upGreek(t("ston_katalogo"))} →
        </Link>
        <a href={`tel:${SHOP.contact.phoneE164}`} className="hdc-btn hdc-btn-line">
          {SHOP.contact.phone}
        </a>
      </div>
    </section>
  );
}
