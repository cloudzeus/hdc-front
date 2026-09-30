import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FaqSection } from "@/components/blog/ArticleView";
import { HdcContentPage } from "@/components/content/HdcContentPage";
import { HdcProductCard } from "@/components/product/HdcProductCard";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { publishedAmong } from "@/lib/blog/articles";
import { articlePath } from "@/lib/blog/post-page";
import { getGreekLexicon } from "@/lib/catalog/greek-lexicon";
import { getAllModels, getHubGroups, getPackoutCodes, getPlatformPower } from "@/lib/catalog/models";
import { getProductsByCode2, getRootCategories } from "@/lib/catalog/queries";
import { modelPath } from "@/lib/milwaukee/model-slug";
import { HUB_KEYS, HUBS, type Hub, type HubKey } from "@/lib/seo/hubs";
import { renderMarkdown } from "@/lib/seo/markdown";
import { faqJsonLd } from "@/lib/seo/product-faq";
import { greekKind } from "@/lib/seo/product-seo";
import { seoFor } from "@/lib/seo/seo-for";
import { breadcrumbJsonLd } from "@/lib/seo/structured-data";
import { absoluteUrl, pageMeta, siteOrigin } from "@/lib/seo/urls";

/**
 * A platform hub — /milwaukee, /milwaukee-m18, /milwaukee-m12, /mx-fuel,
 * /packout: an answer-first intro, the main categories, the popular models
 * (each linking to its model page), batteries and chargers, the hub's own
 * sections and FAQ, and the related articles once they are published.
 *
 * The copy is the PLATFORM SeoOverride (docs/content/seo/platforms, Greek)
 * over the automatic text in the messages; the blocks are live catalogue data.
 */

type Props = { params: Promise<{ locale: Locale }> };

async function hubSeo(hub: Hub, locale: Locale) {
  const t = await getTranslations({ locale, namespace: "seoPages" });
  const h1 = t(`hub_${hub.msg}_h1`);
  const lead = t(`hub_${hub.msg}_lead`);
  return seoFor("PLATFORM", hub.key, locale, { h1, title: h1, description: lead, intro: lead });
}

export function hubRoute(key: HubKey) {
  const hub = HUBS[key];

  async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale } = await params;
    const seo = await hubSeo(hub, locale);
    return {
      ...pageMeta({ path: hub.path, locale, title: seo.title, description: seo.description }),
      title: { absolute: seo.title },
      description: seo.description,
    };
  }

  async function Page({ params }: Props) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <HubPage hub={hub} locale={locale} />;
  }

  return { generateMetadata, Page };
}

async function HubPage({ hub, locale }: { hub: Hub; locale: Locale }) {
  const t = await getTranslations("seoPages");
  const seo = await hubSeo(hub, locale);
  const localName = (row: { nameEl: string; nameEn: string; nameIt: string }) =>
    (locale === "en" ? row.nameEn : locale === "it" ? row.nameIt : row.nameEl) || row.nameEl;

  const [groups, roots, models, power, packout, related, lexicon] = await Promise.all([
    hub.platform
      ? getHubGroups({ platform: hub.platform })
      : hub.nameFilter
        ? getHubGroups({ name: hub.nameFilter })
        : Promise.resolve([]),
    hub.key === "milwaukee" ? getRootCategories(locale) : Promise.resolve([]),
    hub.nameFilter ? Promise.resolve([]) : getAllModels(),
    hub.platform && hub.platform !== "MX" ? getPlatformPower(hub.platform) : Promise.resolve(null),
    hub.nameFilter ? getPackoutCodes() : Promise.resolve([]),
    publishedAmong(seo.relatedArticles),
    getGreekLexicon(),
  ]);

  const categories =
    hub.key === "milwaukee"
      ? roots.map((c) => ({ href: `/katalogos/${c.slug}`, name: c.name, count: c.productCount }))
      : groups.map((g) => ({
          href: `/katalogos/${g.slug}${hub.platform ? `?platform=${hub.platform}` : ""}`,
          name: localName(g),
          count: g.count,
        }));

  const popular = models.filter((m) => !hub.platform || m.platform === hub.platform).slice(0, 12);
  const [batteries, chargers, packoutCards] = await Promise.all([
    power?.batteries.length ? getProductsByCode2(locale, power.batteries) : Promise.resolve([]),
    power?.chargers.length ? getProductsByCode2(locale, power.chargers) : Promise.resolve([]),
    packout.length ? getProductsByCode2(locale, packout) : Promise.resolve([]),
  ]);

  const url = absoluteUrl(hub.path, "el");
  const faqLd = faqJsonLd(seo.faq);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        name: seo.h1,
        description: seo.description,
        url,
        inLanguage: "el-GR",
        isPartOf: { "@id": `${siteOrigin()}/#website` },
        about: hub.platform || hub.nameFilter ? { "@type": "Thing", name: hub.label } : { "@type": "Brand", name: "Milwaukee" },
        ...(popular.length
          ? {
              mainEntity: {
                "@type": "ItemList",
                numberOfItems: popular.length,
                itemListElement: popular.map((m, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  name: `Milwaukee ${m.root}`,
                  url: absoluteUrl(modelPath(m.root), "el"),
                })),
              },
            }
          : {}),
      },
      ...(faqLd ? [{ ...faqLd, "@context": undefined, inLanguage: "el-GR" }] : []),
      {
        ...breadcrumbJsonLd(
          [
            { name: "Αρχική", path: "/" },
            ...(hub.key === "milwaukee" ? [] : [{ name: HUBS.milwaukee.label, path: HUBS.milwaukee.path }]),
            { name: hub.label, path: hub.path },
          ],
          "el",
        ),
        "@context": undefined,
      },
    ],
  };

  return (
    <HdcContentPage
      locale={locale}
      title={seo.h1}
      lead={seo.intro ?? undefined}
      help={false}
      trail={hub.key === "milwaukee" ? [] : [{ href: HUBS.milwaukee.path, label: HUBS.milwaukee.label }]}
      jsonLd={jsonLd}
    >
      {hub.key === "milwaukee" && (
        <section className="hdc-hub-block" aria-labelledby="platformes">
          <h2 id="platformes">{t("platformes")}</h2>
          <div className="hdc-hub-tiles">
            {HUB_KEYS.filter((k) => k !== "milwaukee").map((k) => (
              <Link key={k} href={HUBS[k].path} className="hdc-hub-tile" prefetch={false}>
                {HUBS[k].label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {categories.length > 0 && (
        <section className="hdc-hub-block" aria-labelledby="katigories">
          <h2 id="katigories">{t("kyries_katigories")}</h2>
          <div className="hdc-hub-tiles">
            {categories.map((c) => (
              <Link key={c.href} href={c.href} className="hdc-hub-tile" prefetch={false}>
                {c.name}
                <small>{t("proionta_count", { count: c.count })}</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      {popular.length > 0 && (
        <section className="hdc-hub-block" aria-labelledby="montela">
          <h2 id="montela">{t("dimofili_montela")}</h2>
          <div className="hdc-hub-tiles">
            {popular.map((m) => (
              <Link key={m.root} href={modelPath(m.root)} className="hdc-hub-tile" prefetch={false}>
                Milwaukee {m.root}
                <small>
                  {greekKind({ erpName: m.leadName, code2: m.leadCode2, greekTexts: [], lexicon })} ·{" "}
                  {t("ekdoseis_count", { count: m.versions })}
                </small>
              </Link>
            ))}
          </div>
        </section>
      )}

      {packoutCards.length > 0 && (
        <section className="hdc-hub-block" aria-labelledby="packout">
          <h2 id="packout">{t("packout_proionta")}</h2>
          <div className="hdc-hub-grid">
            {packoutCards.map((card) => (
              <HdcProductCard key={card.id} product={card} />
            ))}
          </div>
        </section>
      )}

      {batteries.length > 0 && (
        <section className="hdc-hub-block" aria-labelledby="bataries">
          <h2 id="bataries">{t("bataries")}</h2>
          <div className="hdc-hub-grid">
            {batteries.map((card) => (
              <HdcProductCard key={card.id} product={card} />
            ))}
          </div>
        </section>
      )}

      {chargers.length > 0 && (
        <section className="hdc-hub-block" aria-labelledby="fortistes">
          <h2 id="fortistes">{t("fortistes")}</h2>
          <div className="hdc-hub-grid">
            {chargers.map((card) => (
              <HdcProductCard key={card.id} product={card} />
            ))}
          </div>
        </section>
      )}

      {seo.body && (
        <div className="hdc-prose hdc-hub-block" lang="el" dangerouslySetInnerHTML={{ __html: renderMarkdown(seo.body) }} />
      )}

      <div lang="el">
        <FaqSection title={t("syxnes_erotiseis")} faq={seo.faq} />
      </div>

      {related.length > 0 && (
        <section className="hdc-hub-block" aria-labelledby="arthra">
          <h2 id="arthra">{t("sxetika_arthra")}</h2>
          <div className="hdc-hub-tiles" lang="el">
            {related.map((a) => (
              <Link key={a.slug} href={articlePath(a)} className="hdc-hub-tile" prefetch={false}>
                {a.title}
              </Link>
            ))}
          </div>
        </section>
      )}
    </HdcContentPage>
  );
}
