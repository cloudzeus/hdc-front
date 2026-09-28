import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { setParamHref, type RawParams } from "@/lib/catalog/filter-href";
import { platformLabel, type Platform } from "@/lib/catalog/hdc-filters";
import type { FacetItem } from "@/lib/catalog/plp-options";
import { upGreek } from "@/lib/greek";

/**
 * The top of the HDC listing pages.
 *
 *  - `HdcCategoryBand`: plp.html `.crumb` + `.band` — graphite with red
 *    diagonal stripes, the name, a line of text, three real counts and the
 *    category's Milwaukee photo. On phones it becomes the frame's plain title.
 *  - `HdcGroupStrip`: plp.html `.groups` — ΟΛΑ and the groups that have
 *    products; it scrolls sideways on phones.
 *  - `HdcSearchBand`: search.html `.rband`.
 */

export function HdcCategoryBand({
  locale,
  name,
  stats,
  image,
}: {
  locale: Locale;
  name: string;
  stats: { groups: number; products: number; platforms: number };
  image: string | null;
}) {
  const t = useTranslations("plp.Hdc");
  const items = [
    { value: stats.groups, label: t("stat_omades") },
    { value: stats.products, label: t("stat_proionta") },
    { value: stats.platforms, label: t("stat_platformes") },
  ].filter((s) => s.value > 0);

  return (
    <>
      <nav aria-label="Breadcrumb" className="hdc-wrap hdc-crumb">
        <Link href="/">{t("archiki")}</Link>
        <i aria-hidden>/</i>
        <span>{name}</span>
      </nav>
      <section className="hdc-band">
        <div className="hdc-wrap">
          <div>
            <h1 className="hdc-disp">{upGreek(name)}</h1>
            {/* The synced taxonomy carries no description, so a short line of
                our own; the platform sentence only where platforms exist. */}
            <p>
              {t("perigrafi")}
              {stats.platforms > 0 && <> {t("mia_mpataria")}</>}
            </p>
            {items.length > 0 && (
              <div className="hdc-band-stats">
                {items.map((s) => (
                  <div key={s.label}>
                    <b>{s.value.toLocaleString(locale)}</b>
                    {upGreek(s.label)}
                  </div>
                ))}
              </div>
            )}
          </div>
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- CDN photo of unknown size; the image optimiser is off site-wide
            <img src={image} alt="" className="hdc-band-img" loading="eager" />
          )}
        </div>
      </section>
    </>
  );
}

export function HdcGroupStrip({
  basePath,
  params,
  groups,
}: {
  basePath: string;
  params: RawParams;
  groups: FacetItem[];
}) {
  const t = useTranslations("plp.Hdc");
  if (groups.length === 0) return null;
  const anyActive = groups.some((g) => g.active);
  return (
    <nav className="hdc-wrap" aria-label={t("omades_aria")}>
      <div className="hdc-groups">
        <Link
          href={setParamHref(basePath, params, "sub", null)}
          scroll={false}
          prefetch={false}
          className={anyActive ? undefined : "is-on"}
          aria-current={anyActive ? undefined : "true"}
        >
          {upGreek(t("ola"))}
        </Link>
        {groups.map((g) => (
          <Link
            key={g.slug}
            href={setParamHref(basePath, params, "sub", g.slug)}
            scroll={false}
            prefetch={false}
            className={g.active ? "is-on" : undefined}
            aria-current={g.active ? "true" : undefined}
          >
            {upGreek(g.label)}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function HdcSearchBand({
  query,
  total,
  models,
  platforms,
}: {
  query: string;
  total: number;
  models: number;
  platforms: Platform[];
}) {
  const t = useTranslations("plp.Hdc");
  const names = platforms.map(platformLabel);
  const joined =
    names.length > 1 ? `${names.slice(0, -1).join(", ")} ${t("kai")} ${names.at(-1)}` : names[0];

  return (
    <section className="hdc-rband">
      <div className="hdc-wrap">
        <p className="hdc-rband-k">{upGreek(t("apotelesmata"))}</p>
        <h1 className="hdc-disp">«{upGreek(query)}»</h1>
        {total > 0 && (
          <p className="hdc-rband-m">
            <b>{t("proionta_count", { count: total })}</b>
            {models > 0 && <> · {t("montela", { count: models })}</>}
            {joined && <> · {joined}</>}
          </p>
        )}
      </div>
    </section>
  );
}
