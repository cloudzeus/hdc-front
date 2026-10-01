import { getTranslations } from "next-intl/server";
import { pageMeta } from "@/lib/seo/urls";
import { categoryBreadcrumb, categoryItemList } from "@/lib/seo/product-schema";
import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { HdcPlpSkeleton } from "@/components/skeleton/HdcPlpSkeleton";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { CompareTray } from "@/components/compare/CompareTray";
import { HdcCategoryBand } from "@/components/plp/hdc/HdcBands";
import { HdcListing } from "@/components/plp/hdc/HdcListing";
import { QuickViewProvider } from "@/components/product/QuickViewProvider";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import {
  COMPARE_MAX,
  getCompareSelection,
  getCompareTray,
} from "@/lib/compare/compare";
import { platformsPresent } from "@/lib/catalog/hdc-filters";
import { milwaukeeCategoryImage } from "@/lib/catalog/milwaukee-categories";
import { PLATFORM_COOKIE, parsePlatformCookie } from "@/lib/catalog/platform-cookie";
import { getPlpData, getPlpSummary, parsePlpParams } from "@/lib/catalog/plp";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { prisma } from "@/lib/prisma";
import { Zone } from "@/components/zones/Zone";
import { jsonLdHtml } from "@/lib/seo/json-ld";
import { FaqSection } from "@/components/blog/ArticleView";
import { faqJsonLd } from "@/lib/seo/product-faq";
import { seoFor } from "@/lib/seo/seo-for";
import { autoCategorySeo } from "@/lib/seo/page-seo";
import { titleWithSite } from "@/lib/seo/title";
import { filteredListingMeta } from "@/lib/catalog/listing-query";
import { admitListingRender, listingBusyMeta } from "@/lib/server/render-gate";
import { ListingBusy } from "@/components/plp/ListingBusy";

type PageProps = {
  params: Promise<{ locale: Locale; kathgoria: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/* `cache()`: the metadata and the page both ask for this row in one request,
   and without it that was two identical lookups per page view. */
const getCategory = cache(async (slug: string) =>
  prisma.category.findUnique({
    where: { slug },
    select: {
      slug: true,
      erpType: true,
      erpCode: true,
      nameEl: true,
      nameEn: true,
      nameIt: true,
      productCount: true,
      childCount: true,
      /* The way back up, first line of the «ΚΑΤΗΓΟΡΙΕΣ» list. */
      parent: { select: { slug: true, nameEl: true, nameEn: true, nameIt: true } },
    },
  }),
);

/**
 * The category's words: the CATEGORY SeoOverride (Greek, admin or
 * docs/content/seo/categories) over the automatic ones — a title in lower case
 * with accents, «Milwaukee» and the platforms; a description of its own; the
 * intro and FAQ from the category's live facets (src/lib/seo/category-copy.ts).
 * en/it keep their generic text: SEO copy is Greek only.
 */
const categorySeo = cache(async (slug: string, locale: Locale) => {
  const category = await getCategory(slug);
  if (!category) return null;
  const t = await getTranslations({ locale, namespace: "katalogos.page" });
  const localName =
    locale === "en" ? category.nameEn : locale === "it" ? category.nameIt : category.nameEl;
  const genericDescription = t("kodikoi_se_ypokatigories_amesi_diathesimotita", {
    productCount: category.productCount,
    childCount: category.childCount,
  });
  if (locale !== "el") {
    return { h1: localName, title: localName, description: genericDescription, intro: null, faq: [] };
  }

  const auto = await autoCategorySeo(slug);
  return seoFor("CATEGORY", slug, locale, auto ?? { h1: localName, title: localName, description: genericDescription });
});

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { kathgoria, locale } = await params;
  const seo = await categorySeo(kathgoria, locale);
  if (!seo) return {};
  return {
    /* Canonical, γλώσσες και Open Graph μαζί: το `openGraph` κληρονομείται
       ολόκληρο από όποια σελίδα δεν ορίζει δικό της, οπότε 12 από 16 σελίδες
       μοιράζονταν με τον τίτλο της αρχικής. */
    ...pageMeta({
      path: `/katalogos/${kathgoria}`,
      locale,
      title: seo.title,
      description: seo.description,
    }),
    title: titleWithSite(seo.title),
    description: seo.description,
    // Filtered views: noindex, follow — the canonical above is the bare listing.
    ...filteredListingMeta(await searchParams),
    // A render the gate turned away (the busy view): noindex too. Same
    // per-request admission as the body; see render-gate.ts.
    ...(await listingBusyMeta("category", await searchParams)),
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { locale, kathgoria } = await params;
  setRequestLocale(locale);

  /*
   * Existence first, before any Suspense boundary, so an unknown slug answers
   * a real 404 status rather than a streamed 200 marked noindex (a soft 404).
   * That is why this route has no loading.tsx above it (the catalogue index
   * keeps its own in `katalogos/(index)`) and shows its skeleton from here.
   */
  if (!(await getCategory(kathgoria))) notFound();

  return (
    <Suspense fallback={<HdcPlpSkeleton />}>
      <CategoryBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CategoryBody({
  params,
  searchParams,
}: PageProps) {
  const { locale, kathgoria } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("katalogos.page");

  const asked = await searchParams;
  // Costly views queue for one of a few render slots; see render-gate.ts.
  if (!(await admitListingRender("category", asked))) return <ListingBusy basePath={`/katalogos/${kathgoria}`} />;

  /*
   * The platform the visitor picked in the mega menu (or on another category
   * page) is remembered in a cookie and opens this page pre-filtered — as a
   * DEFAULT only: an explicit `?platform=` always wins (`all` included, which
   * is what «ΟΛΕΣ» sends), and a category with nothing for that platform
   * (hand tools, PACKOUT) opens unfiltered rather than empty.
   */
  const [summary, jar] = await Promise.all([
    getPlpSummary({ categorySlug: kathgoria }, locale),
    cookies(),
  ]);
  const remembered = parsePlatformCookie(jar.get(PLATFORM_COOKIE)?.value);
  const raw =
    remembered && asked.platform == null && summary.platforms[remembered] > 0
      ? { ...asked, platform: remembered }
      : asked;

  /*
   * HDC listing: prices in the URL are the gross euros the cards print, and
   * `page` N means "the first N pages" — «ΠΕΡΙΣΣΟΤΕΡΑ ΠΡΟΪΟΝΤΑ» appends
   * rather than replaces, and the URL keeps how far the visitor got.
   */
  const plpParams = parsePlpParams(raw, {
    categorySlug: kathgoria,
    grossPrices: true,
    cumulative: true,
  });

  const [
    category,
    data,
    menuTree,
    brands,
    stats,
    rootCategories,
    miniCart,
    compareSelection,
    compareTray,
  ] = await Promise.all([
    getCategory(kathgoria),
    getPlpData(plpParams, locale),
    getMenuTree(locale),
    getTopBrands(locale),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
    getCompareSelection(),
    getCompareTray(locale),
  ]);

  // An unknown slug is a 404, not an empty grid — otherwise every typo renders
  // as a legitimate-looking "no products" page and gets indexed.
  if (!category || !data) notFound();

  const localName = (row: { nameEl: string; nameEn: string; nameIt: string }) =>
    locale === "en" ? row.nameEn : locale === "it" ? row.nameIt : row.nameEl;
  const name = localName(category);
  const parent = category.parent
    ? { slug: category.parent.slug, name: localName(category.parent) }
    : null;

  /* Milwaukee's own photo for the category, from HDCtool (cached for an hour;
     without HDCtool the band simply has no picture). */
  const image = await milwaukeeCategoryImage(category);

  /*
   * The band counts the category as it is, before any filter: its groups with
   * products, its products, the battery platforms among them.
   */
  const platforms = platformsPresent(summary.platforms).length;
  const bandStats = {
    groups: summary.subcategories.filter((g) => g.count > 0).length,
    products: summary.platforms.all,
    platforms,
  };

  /*
   * Whether each card's compare box is ticked, and whether it may be ticked at
   * all. Computed here on the server from the selection cookie so the grid
   * greys out picks the action would refuse — a different classification, or a
   * fifth product — instead of letting the customer find out by clicking.
   */
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

  /*
   * Δομημένα δεδομένα για την κατηγορία. Η λίστα ξεκινά πάντα από την αρχή:
   * με το «Περισσότερα προϊόντα» η σελίδα δείχνει τα προϊόντα 1..N μαζί.
   */
  const itemListLd = categoryItemList(locale, data.products, 0);
  const breadcrumbLd = categoryBreadcrumb(locale, { name, slug: kathgoria, parent });
  const seo = await categorySeo(kathgoria, locale);
  const faqLd = faqJsonLd(seo?.faq ?? []);
  const basePath = `/katalogos/${kathgoria}`;

  return (
    <QuickViewProvider locale={locale}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }}
      />
      {itemListLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(itemListLd) }}
        />
      )}
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml({ ...faqLd, inLanguage: "el-GR" }) }}
        />
      )}
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
        featured={data.products[0] ?? null}
      />

      <main id="main" className="hdc-plp-page">
        <Zone id="category.top" locale={locale} />
        <HdcCategoryBand
          locale={locale}
          name={name}
          h1={seo?.h1}
          stats={bandStats}
          image={image}
        />
        {seo?.intro && (
          <section className="hdc-wrap hdc-cat-intro" lang="el">
            <p>{seo.intro}</p>
          </section>
        )}
        <Zone id="category.middle" locale={locale} />
        <HdcListing
          variant="category"
          locale={locale}
          basePath={basePath}
          params={raw}
          data={data}
          compareStateFor={compareStateFor}
          rememberedPlatform={remembered != null}
          category={{ name, parent }}
        />
        {seo && seo.faq.length > 0 && (
          <div className="hdc-wrap hdc-cat-faq" lang="el">
            <FaqSection title={t("syxnes_erotiseis")} faq={seo.faq} />
          </div>
        )}
        <Zone id="category.bottom" locale={locale} />
      </main>

      <SiteFooter categories={rootCategories} />
      <CompareTray tray={compareTray} />
    </QuickViewProvider>
  );
}
