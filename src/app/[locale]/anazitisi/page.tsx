import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { alternatesFor, localisedPath } from "@/lib/seo/urls";
import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import SearchSkeleton from "./skeleton";
import { searchRedirectTarget } from "@/lib/catalog/search-redirect";
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
import { findByExactCode, getDidYouMean } from "@/lib/catalog/suggest";
import { SUGGEST_MIN_LENGTH } from "@/lib/catalog/suggest-options";
import {
  getCatalogueStats,
  getFeaturedProducts,
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
import { PRIMARY_PHONE } from "@/config/shop";
import { HdcProductCard } from "@/components/product/HdcProductCard";
import type { ProductCardData } from "@/lib/catalog/queries";
import { availabilityLabelKey, availabilityOf } from "@/lib/catalog/availability";
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
/** Parameters that say nothing about what was searched: tracking only. */
const TRACKING = /^(utm_\w+|gclid|fbclid|msclkid)$/;

export default async function SearchPage(props: PageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  /*
   * An article number, EAN or model lands on its page (308): the product with
   * that code when it is exactly one, the model page for a model. Only for a
   * bare query — with a category or filters the visitor is browsing results.
   * Decided before any Suspense boundary, so the redirect is a real HTTP 308;
   * that is why this route lives outside `(site)` and its loading.tsx.
   */
  const raw = await props.searchParams;
  const query = (Array.isArray(raw.q) ? raw.q[0] : raw.q)?.trim() ?? "";
  const bare = Object.keys(raw).every((key) => key === "q" || TRACKING.test(key));
  if (query && bare) {
    const target = await searchRedirectTarget(query);
    if (target) {
      const tracking = new URLSearchParams();
      for (const [key, value] of Object.entries(raw)) {
        if (TRACKING.test(key)) tracking.set(key, Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
      }
      const search = tracking.toString();
      permanentRedirect(`${localisedPath(target, locale)}${search ? `?${search}` : ""}`);
    }
  }

  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchBody {...props} />
    </Suspense>
  );
}

async function SearchBody({ params, searchParams }: PageProps) {
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

  /* Nothing at all (search.html §3): the closest models and what sells — only
     fetched when they are going to be shown. */
  const zero = searchable && found === 0 && !exact;
  const [didYouMean, popular] = zero
    ? await Promise.all([getDidYouMean(query), getFeaturedProducts(locale, 5, 2, true)])
    : [[], []];

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

        {zero ? null : searchable ? (
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
                    availabilityOf(exact) === "stock" ? "hdc-card-avail--ok" : "hdc-card-avail--wait"
                  }
                >
                  ● {t(availabilityLabelKey(availabilityOf(exact), exact.qty))}
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
          zero && <NoResults query={query} didYouMean={didYouMean} popular={popular} />
        )}
        <Zone id="search.bottom" locale={locale} />
      </main>

      <SiteFooter categories={rootCategories} />
      <CompareTray tray={compareTray} />
    </QuickViewProvider>
  );
}

/**
 * Zero results (search.html §3).
 *
 * Never an empty page — always a way on: the closest models in the catalogue
 * (pg_trgm similarity on the model root, not a guess), what to try, a person
 * to ask with the query already in the message, and what other customers buy.
 */
async function NoResults({
  query,
  didYouMean,
  popular,
}: {
  query: string;
  didYouMean: string[];
  popular: ProductCardData[];
}) {
  const t = await getTranslations("anazitisi.page");
  const b = (chunks: React.ReactNode) => <b>{chunks}</b>;
  const ask = `/epikoinonia?${new URLSearchParams({ q: query }).toString()}`;

  return (
    <>
      <section className="hdc-wrap hdc-zero2">
        <div>
          <h1 className="hdc-disp">{upGreek(t("den_vrikame_tipota", { query }))}</h1>
          <p className="hdc-zero2-lead">{t("zero_keimeno")}</p>

          {didYouMean.length > 0 && (
            <div className="hdc-zero2-dym">
              <h2>{upGreek(t("mipos_ennoeite"))}</h2>
              <div className="hdc-sg-chips">
                {didYouMean.map((root, i) => (
                  <Link
                    key={root}
                    href={`/anazitisi?${new URLSearchParams({ q: root }).toString()}`}
                    className={i === 0 ? "is-red" : undefined}
                  >
                    {root}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <ul className="hdc-zero2-tips">
            <li>
              <span>{t.rich("tip_kodikos", { b })}</span>
            </li>
            <li>
              <span>{t.rich("tip_amerikanikoi", { b })}</span>
            </li>
            <li>
              <span>{t("tip_ligoteres")}</span>
            </li>
          </ul>
        </div>

        <aside className="hdc-ask">
          <h2 className="hdc-disp">{upGreek(t("rotiste"))}</h2>
          <p>{t("rotiste_keimeno")}</p>
          <a href={`tel:${PRIMARY_PHONE.e164}`} className="hdc-ask-ph">
            {PRIMARY_PHONE.display}
          </a>
          <Link href={ask} className="hdc-btn hdc-btn-red">
            {upGreek(t("steilte_minyma"))}
          </Link>
        </aside>
      </section>

      {popular.length > 0 && (
        <section className="hdc-wrap hdc-pop">
          <h2 className="hdc-disp">{upGreek(t("agorazoun"))}</h2>
          <div className="hdc-cards">
            {popular.map((product) => (
              <HdcProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
