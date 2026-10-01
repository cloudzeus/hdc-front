import { getLocale, getTranslations } from "next-intl/server";
import { HdcContentPage } from "@/components/content/HdcContentPage";
import { Link } from "@/i18n/navigation";
import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";
import { HUBS } from "@/lib/seo/hubs";
import { LISTING_LIMITS } from "@/lib/catalog/listing-query";

/**
 * The shop's own 404: what happened, a search box that takes an article
 * number, a model or an EAN (what most lost visitors were looking for), and
 * the pages that lead back into the catalogue. Greek unless the address was
 * /en or /it. The status stays 404 — this only changes what the visitor sees.
 */
export async function NotFoundView() {
  const requested = await getLocale();
  const locale: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "notFound" });

  const links = [
    { href: "/katalogos", label: t("katalogos") },
    { href: HUBS.m18.path, label: "Milwaukee M18" },
    { href: HUBS.m12.path, label: "Milwaukee M12" },
    { href: HUBS.packout.path, label: "PACKOUT" },
    { href: "/odigoi", label: t("odigoi") },
    { href: "/epikoinonia", label: t("epikoinonia") },
  ];

  return (
    <HdcContentPage locale={locale} title={t("titlos")} lead={t("keimeno")}>
      <form action={locale === "el" ? "/anazitisi" : `/${locale}/anazitisi`} method="get" role="search" className="hdc-404-search">
        <label htmlFor="hdc-404-q">{t("anazitisi_label")}</label>
        <div>
          <input id="hdc-404-q" name="q" type="search" maxLength={LISTING_LIMITS.maxQueryLength} placeholder={t("anazitisi_placeholder")} autoComplete="off" />
          <button type="submit" className="hdc-btn hdc-btn-red">
            {t("anazitisi")}
          </button>
        </div>
      </form>
      <section className="hdc-hub-block" aria-labelledby="hdc-404-links">
        <h2 id="hdc-404-links">{t("i_deite")}</h2>
        <div className="hdc-hub-tiles">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hdc-hub-tile" prefetch={false}>
              {l.label}
            </Link>
          ))}
        </div>
      </section>
    </HdcContentPage>
  );
}
