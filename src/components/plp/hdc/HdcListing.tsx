import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { HdcMobileBar } from "@/components/plp/hdc/HdcMobileBar";
import { HdcPriceRange } from "@/components/plp/hdc/HdcPriceRange";
import {
  HdcSortSelect,
  type SortChoice,
} from "@/components/plp/hdc/HdcSortSelect";
import { PlatformLink } from "@/components/plp/hdc/PlatformLink";
import { HdcProductCard } from "@/components/product/HdcProductCard";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  setParamHref,
  setParamKeepingPage,
  toggleMultiHref,
  type RawParams,
} from "@/lib/catalog/filter-href";
import {
  CONTENTS,
  SERIES,
  STOCK,
  activeFilterCount,
  netToGross,
  parseAvail,
  parseContent,
  parsePlatform,
  parseSeries,
  platformLabel,
  type Platform,
} from "@/lib/catalog/hdc-filters";
import type { PlpResult } from "@/lib/catalog/plp";
import { SORT_OPTIONS, type PlpFacets, type SortValue } from "@/lib/catalog/plp-options";
import { DEFAULT_VAT_RATE } from "@/lib/format";
import { upGreek } from "@/lib/greek";

/**
 * The body of an HDC listing — category page and search results alike
 * (plp.html; search.html section 2): the platform control, the filter column
 * (headed by «ΚΑΤΗΓΟΡΙΕΣ»), the toolbar with chips and sort, the grid of HDC
 * cards, «ΠΕΡΙΣΣΟΤΕΡΑ ΠΡΟΪΟΝΤΑ», and on phones and tablets the sticky bar with
 * its filter sheet, which carries the same categories at the top.
 *
 * Nothing here scrolls sideways: the categories are a vertical list in the
 * column (and the sheet), and the phone platform chips wrap.
 *
 * A server component. Every filter is a link computed from the current URL,
 * so a filtered view is a shareable address and nothing here hydrates except
 * the sort select, the price range and the sheet's open flag.
 */

type Variant = "category" | "search";

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

function numParam(v: string | string[] | undefined): number | undefined {
  const n = Number.parseFloat(first(v) ?? "");
  return Number.isFinite(n) ? n : undefined;
}

/** «ΚΑΘΑΡΙΣΜΟΣ»: every filter goes; the query, the scope and the sort stay. */
function clearHref(basePath: string, params: RawParams): string {
  const next = new URLSearchParams();
  for (const key of ["q", "cat", "sort"]) {
    const value = first(params[key]);
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export async function HdcListing({
  variant,
  locale,
  basePath,
  params,
  data,
  compareStateFor,
  rememberedPlatform = false,
  category = null,
}: {
  variant: Variant;
  locale: Locale;
  basePath: string;
  params: RawParams;
  data: PlpResult;
  /**
   * A platform is remembered in the cookie, so a URL without `?platform`
   * would bring it back: «ΟΛΕΣ» must say `platform=all` explicitly.
   */
  rememberedPlatform?: boolean;
  /** Category pages: the page's own name and its parent, for «ΚΑΤΗΓΟΡΙΕΣ». */
  category?: CategoryContext | null;
  compareStateFor: (
    slug: string,
    scopeKey?: string | null,
  ) => { selected: boolean; disabled: boolean };
}) {
  const t = await getTranslations("plp.Hdc");
  const facets = data.facets;
  const n = activeFilterCount(params);

  const sortLabel: Record<SortValue, string> = {
    relevance: variant === "search" ? t("sort_schetikotita") : t("sort_dimofili"),
    "price-asc": t("sort_price_asc"),
    "price-desc": t("sort_price_desc"),
    "name-asc": t("sort_name_asc"),
    newest: t("sort_newest"),
  };
  const sortValue = first(params.sort) ?? "relevance";
  const sortOptions: SortChoice[] = SORT_OPTIONS.map((o) => ({
    value: o.value,
    label: sortLabel[o.value],
    href: setParamHref(
      basePath,
      params,
      "sort",
      o.value === "relevance" ? null : o.value,
    ),
  }));
  const currentSort = sortOptions.some((o) => o.value === sortValue)
    ? sortValue
    : "relevance";

  const shown = data.products.length;

  return (
    <>
      <div className="hdc-wrap hdc-plp">
        <PlatformControl
          variant={variant}
          basePath={basePath}
          params={params}
          facets={facets}
          locale={locale}
          allValue={rememberedPlatform ? "all" : null}
        />

        <div className="hdc-plp-body">
          <aside className="hdc-filters" aria-label={t("filtra")}>
            <CategoryNav
              variant={variant}
              basePath={basePath}
              params={params}
              facets={facets}
              locale={locale}
              category={category}
            />
            <div className="hdc-filters-head">
              {upGreek(t("filtra"))}
              <Link
                href={clearHref(basePath, params)}
                scroll={false}
                prefetch={false}
              >
                {upGreek(t("katharismos"))}
              </Link>
            </div>
            <FilterGroups
              basePath={basePath}
              params={params}
              facets={facets}
              locale={locale}
              dots={variant === "category"}
            />
          </aside>

          <div className="hdc-plp-main">
            <Toolbar
              total={data.total}
              basePath={basePath}
              params={params}
              facets={facets}
              locale={locale}
              allValue={rememberedPlatform ? "all" : null}
              sort={
                <HdcSortSelect
                  value={currentSort}
                  options={sortOptions}
                  label={upGreek(t("taxinomisi"))}
                />
              }
            />

            {data.total === 0 ? (
              <div className="hdc-plp-empty">
                <p className="hdc-disp">{upGreek(t("kanena"))}</p>
                <p>{t("kanena_keimeno")}</p>
                <Link
                  href={clearHref(basePath, params)}
                  className="hdc-btn hdc-btn-line"
                  prefetch={false}
                >
                  {upGreek(t("katharismos_filtron"))}
                </Link>
              </div>
            ) : (
              <>
                <div className="hdc-plp-grid">
                  {data.products.map((product) => (
                    <HdcProductCard
                      key={product.id}
                      product={product}
                      quickView
                      compare={compareStateFor(product.slug, product.scopeKey)}
                    />
                  ))}
                </div>

                <div className="hdc-more">
                  <p>{t("vlepete", { shown, total: data.total })}</p>
                  <div className="hdc-more-bar" aria-hidden>
                    <i
                      style={{
                        width: `${Math.min(100, (shown / Math.max(1, data.total)) * 100)}%`,
                      }}
                    />
                  </div>
                  {shown < data.total && (
                    <Link
                      href={setParamKeepingPage(
                        basePath,
                        params,
                        "page",
                        String(data.page + 1),
                      )}
                      scroll={false}
                      prefetch={false}
                      rel="next"
                      className="hdc-more-btn"
                    >
                      {upGreek(t("perissotera"))}
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <HdcMobileBar
        filtersLabel={upGreek(n > 0 ? t("filtra_n", { n }) : t("filtra"))}
        title={upGreek(t("filtra"))}
        closeLabel={t("kleisimo")}
        applyLabel={upGreek(t("deite", { count: data.total }))}
        sort={
          <HdcSortSelect
            variant="bar"
            value={currentSort}
            options={sortOptions}
            label={upGreek(t("taxinomisi"))}
          />
        }
      >
        <CategoryNav
          variant={variant}
          basePath={basePath}
          params={params}
          facets={facets}
          locale={locale}
          category={category}
        />
        <FilterGroups
          basePath={basePath}
          params={params}
          facets={facets}
          locale={locale}
          dots={false}
        />
      </HdcMobileBar>
    </>
  );
}

/**
 * ΟΛΕΣ / M12 / M18 / MX FUEL — the first filter, above everything.
 *
 * The category page describes each platform; search results count them
 * instead (search.html). A platform with nothing in the result set is shown
 * greyed out, not hidden. When nothing in the listing belongs to a platform
 * (hand tools, PACKOUT) the control is left out altogether.
 */
function PlatformControl({
  variant,
  basePath,
  params,
  facets,
  locale,
  allValue,
}: {
  variant: Variant;
  allValue: string | null;
  basePath: string;
  params: RawParams;
  facets: PlpFacets;
  locale: Locale;
}) {
  const t = useTranslations("plp.Hdc");
  const active = parsePlatform(params.platform) ?? "all";
  const counts = facets.platforms;
  if (active === "all" && counts.M12 + counts.M18 + counts.MX === 0)
    return null;

  const desc = {
    all: t("plat_oles_desc"),
    M12: t("plat_m12_desc"),
    M18: t("plat_m18_desc"),
    MX: t("plat_mx_desc"),
  };
  const items = (["all", "M12", "M18", "MX"] as const).map((key) => ({
    key,
    label:
      key === "all" ? upGreek(t("plat_oles")) : platformLabel(key as Platform),
    note: variant === "search" ? counts[key].toLocaleString(locale) : desc[key],
    href: setParamHref(
      basePath,
      params,
      "platform",
      key === "all" ? allValue : key,
    ),
    on: active === key,
    off: key !== "all" && active !== key && counts[key] === 0,
  }));

  return (
    <nav
      className={`hdc-pfc hdc-pfc--${variant}`}
      aria-label={t("platform_aria")}
    >
      <div className="hdc-pfc-grid">
        {items.map((item) =>
          item.off ? (
            <span key={item.key} className="is-off" aria-disabled="true">
              <b>{item.label}</b>
              <span>{item.note}</span>
            </span>
          ) : (
            <PlatformLink
              key={item.key}
              platform={item.key}
              href={item.href}
              scroll={false}
              prefetch={false}
              className={item.on ? "is-on" : undefined}
              aria-current={item.on ? "true" : undefined}
            >
              <b>{item.label}</b>
              <span>{item.note}</span>
            </PlatformLink>
          ),
        )}
      </div>
      {/* Phones: the same choice as a row of chips (plp.html `.pchips`). */}
      <div className="hdc-pchips">
        {items.map((item) =>
          item.off ? (
            <span key={item.key} className="is-off" aria-disabled="true">
              {item.label}
            </span>
          ) : (
            <PlatformLink
              key={item.key}
              platform={item.key}
              href={item.href}
              scroll={false}
              prefetch={false}
              className={item.on ? "is-on" : undefined}
              aria-current={item.on ? "true" : undefined}
            >
              {item.label}
            </PlatformLink>
          ),
        )}
      </div>
    </nav>
  );
}

type CategoryContext = {
  name: string;
  parent: { slug: string; name: string } | null;
};

/**
 * «ΚΑΤΗΓΟΡΙΕΣ» — the first section of the filter column and of the phone
 * sheet, a vertical list (it used to be a strip above the grid that scrolled
 * sideways on phones).
 *
 *  - Category page: a small tree. The parent category, if any, as the way
 *    back up; the page's own category («all of it»); its groups indented
 *    beneath, each with its count. The URLs are the strip's: `?sub=` picks
 *    one group, without it the whole category shows.
 *  - Search results: the root categories in the result set, ticked like the
 *    other filters (several at once).
 */
function CategoryNav({
  variant,
  basePath,
  params,
  facets,
  locale,
  category,
}: {
  variant: Variant;
  basePath: string;
  params: RawParams;
  facets: PlpFacets;
  locale: Locale;
  category: CategoryContext | null;
}) {
  const t = useTranslations("plp.Hdc");
  const items = facets.subcategories;
  const title = t("katigories");

  if (variant === "search") {
    if (items.length === 0) return null;
    return (
      <div className="hdc-cnav" role="group" aria-label={title}>
        <p className="hdc-cnav-head">{upGreek(title)}</p>
        {items.map((c) => (
          <FilterOption
            key={c.slug}
            href={toggleMultiHref(basePath, params, "sub", c.slug)}
            active={c.active}
            label={c.label}
            count={c.count}
            locale={locale}
          />
        ))}
      </div>
    );
  }

  if (!category || (items.length === 0 && !category.parent)) return null;
  const anyActive = items.some((g) => g.active);

  return (
    <nav className="hdc-cnav" aria-label={title}>
      <p className="hdc-cnav-head">{upGreek(title)}</p>
      <ul>
        {category.parent && (
          <li>
            <Link
              href={`/katalogos/${category.parent.slug}`}
              prefetch={false}
              className="hdc-cnav-up"
            >
              <span aria-hidden>‹</span>
              <span className="hdc-cnav-label">{category.parent.name}</span>
            </Link>
          </li>
        )}
        <li>
          <Link
            href={setParamHref(basePath, params, "sub", null)}
            scroll={false}
            prefetch={false}
            className={`hdc-cnav-self${anyActive ? "" : " is-on"}`}
            aria-current={anyActive ? undefined : "page"}
          >
            <span className="hdc-cnav-label">{category.name}</span>
          </Link>
          {items.length > 0 && (
            <ul>
              {items.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={setParamHref(basePath, params, "sub", g.slug)}
                    scroll={false}
                    prefetch={false}
                    className={g.active ? "is-on" : undefined}
                    aria-current={g.active ? "page" : undefined}
                  >
                    <span className="hdc-cnav-label">{g.label}</span>
                    <span className="hdc-cnav-count">
                      {g.count.toLocaleString(locale)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </li>
      </ul>
    </nav>
  );
}

/**
 * ΔΙΑΘΕΣΙΜΟΤΗΤΑ, ΠΕΡΙΕΧΟΜΕΝΟ, ΣΕΙΡΑ, ΤΙΜΗ.
 *
 * Rendered twice: in the left column and inside the phone sheet. Counts are
 * the result set's, each group counted without its own ticks. A box with
 * nothing behind it is greyed out rather than a link to an empty grid.
 *
 * Not here yet, though the mockup has them: ΜΠΑΤΑΡΙΕΣ ΣΤΟ ΚΙΤ and ΥΠΟΔΟΧΗ —
 * the catalogue does not store battery count/capacity or drive size as data.
 */
function FilterGroups({
  basePath,
  params,
  facets,
  locale,
  dots,
}: {
  basePath: string;
  params: RawParams;
  facets: PlpFacets;
  locale: Locale;
  dots: boolean;
}) {
  const t = useTranslations("plp.Hdc");
  const avail = parseAvail(params.avail);
  const content = new Set(parseContent(params.content) ?? []);
  const series = new Set(parseSeries(params.series) ?? []);

  const bounds = {
    min: Math.floor(netToGross(facets.priceBounds.min, DEFAULT_VAT_RATE)),
    max: Math.ceil(netToGross(facets.priceBounds.max, DEFAULT_VAT_RATE)),
  };
  const current = { min: numParam(params.min), max: numParam(params.max) };
  const priceBase = setParamHref(
    basePath,
    { ...params, min: undefined, max: undefined },
    "page",
    null,
  );

  const hasContent =
    facets.content.bare + facets.content.kit > 0 || content.size > 0;
  const hasSeries =
    facets.series.fuel + facets.series.onekey > 0 || series.size > 0;

  return (
    <div className="hdc-fgroups">
      <FilterGroup title={t("diathesimotita")}>
        <FilterOption
          href={toggleMultiHref(basePath, params, "avail", "in-stock", STOCK)}
          active={avail === "in-stock"}
          label={t("se_apothema")}
          count={facets.stock.inStock}
          locale={locale}
          dot={dots ? "ok" : undefined}
        />
        <FilterOption
          href={toggleMultiHref(basePath, params, "avail", "order", STOCK)}
          active={avail === "order"}
          label={t("paradosi")}
          count={facets.stock.order}
          locale={locale}
          dot={dots ? "wait" : undefined}
        />
      </FilterGroup>

      {hasContent && (
        <FilterGroup title={t("periechomeno")}>
          <FilterOption
            href={toggleMultiHref(
              basePath,
              params,
              "content",
              "bare",
              CONTENTS,
            )}
            active={content.has("bare")}
            label={t("sketo")}
            count={facets.content.bare}
            locale={locale}
          />
          <FilterOption
            href={toggleMultiHref(basePath, params, "content", "kit", CONTENTS)}
            active={content.has("kit")}
            label={t("kit")}
            count={facets.content.kit}
            locale={locale}
          />
        </FilterGroup>
      )}

      {hasSeries && (
        <FilterGroup title={t("seira")}>
          <FilterOption
            href={toggleMultiHref(basePath, params, "series", "fuel", SERIES)}
            active={series.has("fuel")}
            label="FUEL™"
            count={facets.series.fuel}
            locale={locale}
          />
          <FilterOption
            href={toggleMultiHref(basePath, params, "series", "onekey", SERIES)}
            active={series.has("onekey")}
            label="ONE-KEY™"
            count={facets.series.onekey}
            locale={locale}
          />
          <FilterOption
            href={toggleMultiHref(basePath, params, "series", "basic", SERIES)}
            active={series.has("basic")}
            label={t("vasiki")}
            count={facets.series.basic}
            locale={locale}
          />
        </FilterGroup>
      )}

      {bounds.max > bounds.min && (
        <FilterGroup title={t("timi")}>
          <HdcPriceRange
            key={`${current.min ?? ""}-${current.max ?? ""}-${bounds.min}-${bounds.max}`}
            bounds={bounds}
            current={current}
            baseHref={priceBase}
            labels={{ min: t("timi_apo"), max: t("timi_eos") }}
          />
        </FilterGroup>
      )}
    </div>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details open className="hdc-fg">
      <summary>{upGreek(title)}</summary>
      <div>{children}</div>
    </details>
  );
}

function FilterOption({
  href,
  active,
  label,
  count,
  dot,
  locale,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  dot?: "ok" | "wait";
  locale: Locale;
}) {
  const inner = (
    <>
      <i className={active ? "on" : undefined} aria-hidden />
      {dot && <span className={`hdc-fdot hdc-fdot--${dot}`} aria-hidden />}
      <span className="hdc-fopt-label">{label}</span>
      <span className="hdc-fopt-count">{count.toLocaleString(locale)}</span>
    </>
  );
  if (!active && count === 0) {
    return (
      <span
        className="hdc-fopt is-off"
        role="checkbox"
        aria-checked="false"
        aria-disabled="true"
      >
        {inner}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      className="hdc-fopt"
      role="checkbox"
      aria-checked={active}
    >
      {inner}
    </Link>
  );
}

/** «N ΠΡΟΪΟΝΤΑ», a black chip per active filter, and the sort box. */
function Toolbar({
  total,
  basePath,
  params,
  facets,
  locale,
  sort,
  allValue,
}: {
  allValue: string | null;
  total: number;
  basePath: string;
  params: RawParams;
  facets: PlpFacets;
  locale: Locale;
  sort: React.ReactNode;
}) {
  const t = useTranslations("plp.Hdc");
  const chips: Array<{ label: string; href: string; platform?: boolean }> = [];

  const platform = parsePlatform(params.platform);
  if (platform) {
    chips.push({
      label: platformLabel(platform),
      href: setParamHref(basePath, params, "platform", allValue),
      platform: true,
    });
  }
  const avail = parseAvail(params.avail);
  if (avail !== "all") {
    chips.push({
      label: avail === "in-stock" ? t("se_apothema") : t("paradosi"),
      href: setParamHref(basePath, params, "avail", null),
    });
  }
  for (const c of parseContent(params.content) ?? []) {
    chips.push({
      label: c === "bare" ? t("sketo") : t("kit"),
      href: toggleMultiHref(basePath, params, "content", c, CONTENTS),
    });
  }
  for (const s of parseSeries(params.series) ?? []) {
    chips.push({
      label: s === "fuel" ? "FUEL™" : s === "onekey" ? "ONE-KEY™" : t("vasiki"),
      href: toggleMultiHref(basePath, params, "series", s, SERIES),
    });
  }
  for (const sub of facets.subcategories.filter((s) => s.active)) {
    chips.push({
      label: sub.label,
      href: toggleMultiHref(basePath, params, "sub", sub.slug),
    });
  }
  const min = numParam(params.min);
  const max = numParam(params.max);
  if (min != null || max != null) {
    const fmt = (v: number) => `${Math.round(v).toLocaleString(locale)} €`;
    chips.push({
      label: `${min != null ? fmt(min) : "0 €"} – ${max != null ? fmt(max) : "∞"}`,
      href: setParamHref(basePath, { ...params, min: undefined }, "max", null),
    });
  }

  return (
    <div className="hdc-toolbar">
      <span className="hdc-toolbar-count">
        {upGreek(t("proionta_count", { count: total }))}
      </span>
      {chips.map((chip) =>
        chip.platform ? (
          <PlatformLink
            key={chip.label}
            platform="all"
            href={chip.href}
            scroll={false}
            prefetch={false}
            className="hdc-chip"
            aria-label={t("afairesi", { label: chip.label })}
          >
            {upGreek(chip.label)} <b aria-hidden>✕</b>
          </PlatformLink>
        ) : (
          <Link
            key={chip.label}
            href={chip.href}
            scroll={false}
            prefetch={false}
            className="hdc-chip"
            aria-label={t("afairesi", { label: chip.label })}
          >
            {upGreek(chip.label)} <b aria-hidden>✕</b>
          </Link>
        ),
      )}
      {sort}
    </div>
  );
}
