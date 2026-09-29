import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { HdcBuyActions } from "@/components/pdp/hdc/HdcBuyActions";
import { HdcGallery, type GalleryTag } from "@/components/pdp/hdc/HdcGallery";
import { HdcSection } from "@/components/pdp/hdc/HdcSection";
import { HdcSectionNav } from "@/components/pdp/hdc/HdcSectionNav";
import { HdcSizePicker } from "@/components/pdp/hdc/HdcSizePicker";
import { HdcProductCard } from "@/components/product/HdcProductCard";
import { QuickViewProvider } from "@/components/product/QuickViewProvider";
import { Zone } from "@/components/zones/Zone";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { approvedReviews } from "@/lib/account/reviews";
import { favouriteIds } from "@/lib/account/favourite-ids";
import { getMiniCart } from "@/lib/cart/cart";
import { FREE_SHIPPING_THRESHOLD_NET } from "@/lib/cart/options";
import { getModelVariants, type ModelVariant } from "@/lib/catalog/hdc-pdp";
import { isBattery } from "@/lib/hdc-nav";
import { availabilityOf, isLastPiece } from "@/lib/catalog/availability";
import { getProductBySlug } from "@/lib/catalog/pdp";
import { variantsOf } from "@/lib/catalog/variants";
import {
  getCatalogueStats,
  getMenuTree,
  getPlatformBatteries,
  getProductsByCode2,
  getRootCategories,
  getSameBatteryTools,
  getTopBrands,
} from "@/lib/catalog/queries";
import { COMPARE_MAX, getCompareSelection } from "@/lib/compare/compare";
import { scopeKeyOf } from "@/lib/compare/options";
import { formatMoney, grossAmount } from "@/lib/format";
import { upGreek } from "@/lib/greek";
import { displayName, platformTag } from "@/lib/milwaukee/display";
import { parseModel } from "@/lib/milwaukee/model";
import {
  ahLabel,
  boxFacts,
  localizeBoxFacts,
  descriptionParagraphs,
  inTheBox,
  keyNumbers,
  matchBattery,
  pdpTitle,
  specTable,
  withTrademark,
} from "@/lib/milwaukee/pdp";
import { kitFromTechBlock, parseTechBlock } from "@/lib/milwaukee/tech-block";
import { discountedNet, offerBadgeFor } from "@/lib/offers/badges";
import {
  priceValidUntil,
  productBreadcrumb,
  returnPolicy,
  shippingDetails,
} from "@/lib/seo/product-schema";
import { absoluteUrl, pageMeta } from "@/lib/seo/urls";

type PageProps = {
  params: Promise<{ locale: Locale; slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and metadata
  // is generated outside it.
  const t = await getTranslations({ locale, namespace: "pdp.Hdc" });
  const product = await getProductBySlug(slug, locale);
  if (!product) return {};

  const title = displayName(product.name, product.code2);
  const description =
    product.shortDescription ??
    t("meta_description", { name: title, code: product.code2 || product.sku });
  return {
    ...pageMeta({
      path: `/proion/${slug}`,
      locale,
      title,
      description,
      image: product.images[0]?.url,
    }),
    title,
    description,
  };
}

/** Kit sizes Milwaukee sells in, «5.0» — used when a kit says nothing else. */
const DEFAULT_BAND_AH: Record<string, number> = { M18: 5, M12: 4 };

/**
 * The HDC product page (docs/design/mockups/pdp.html).
 *
 * Top: breadcrumb, gallery and buy box — platform tag, title with the model
 * root, codes, the four key numbers, the bare/kit selector, the price box and
 * the service grid. Then a sticky section bar over the description, the
 * specifications, what is in the box, documents and reviews, and the graphite
 * «same battery» band.
 *
 * Every technical fact comes from the manufacturer's «Τεχνικά χαρακτηριστικά»
 * block of the Greek description (`parseTechBlock`), never from the AI-filled
 * spec table — it says 135 Nm for the FPD3, Milwaukee says 158.
 */
export default async function ProductPage({ params }: PageProps) {
  const t = await getTranslations("pdp.Hdc");
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const product = await getProductBySlug(slug, locale);
  if (!product) notFound();

  const platform = product.platform;
  const model = parseModel(product.erpName);
  const techRows = parseTechBlock(product.longDescriptionEl);
  // What the spec table and the box words show. Greek facts, local labels:
  // there is no Italian block, so Italian gets the English one.
  const localTechRows = locale === "el" ? [] : parseTechBlock(product.longDescriptionEn);
  const kit =
    product.modelContent === "kit" ? (kitFromTechBlock(techRows) ?? model?.kit ?? null) : null;

  const [
    menuTree,
    brands,
    stats,
    rootCategories,
    miniCart,
    favourites,
    compareSelection,
    reviews,
    variants,
    batteries,
    offer,
    sizes,
  ] = await Promise.all([
    getMenuTree(locale),
    getTopBrands(locale),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
    favouriteIds(),
    getCompareSelection(),
    approvedReviews(product),
    product.modelRoot ? getModelVariants(product.modelRoot) : Promise.resolve([] as ModelVariant[]),
    platform ? getPlatformBatteries(platform) : Promise.resolve([]),
    offerBadgeFor(
      { slug: product.slug, brandSlug: product.brand?.slug ?? null, unitNet: product.priceNet },
      locale,
    ),
    /* The same product in its other sizes — gloves, clothing, boots. */
    variantsOf(product),
  ]);

  /* The same-battery band: the platform's battery first, then bare tools. */
  const bandBattery = platform
    ? matchBattery(batteries, platform, kit?.ah ?? DEFAULT_BAND_AH[platform] ?? 0)
    : null;
  const [bandBatteryCards, bandTools] = await Promise.all([
    bandBattery ? getProductsByCode2(locale, [bandBattery.product.code2]) : Promise.resolve([]),
    platform
      ? getSameBatteryTools(locale, platform, product.modelRoot, bandBattery ? 4 : 5)
      : Promise.resolve([]),
  ]);
  const bandCards = [...bandBatteryCards, ...bandTools].slice(0, 5);

  // ── Prices ───────────────────────────────────────────────────────────────
  const ctx = { vatRate: product.vatRate };
  /* The price the cart charges: the campaign discount, when one covers it. */
  const finalNet =
    product.priceNet == null ? null : discountedNet(product.priceNet, offer?.discountPercent ?? 0);
  const discounted = product.priceNet != null && (offer?.discountPercent ?? 0) > 0;
  const gross = finalNet == null ? null : grossAmount(finalNet, ctx);
  const price = gross == null ? "—" : formatMoney(gross, locale);

  /* Sibling prices on the same footing — the hint's difference is real money. */
  const variantGross = new Map<string, number | null>(
    await Promise.all(
      variants.map(async (v): Promise<[string, number | null]> => {
        if (v.id === product.id) return [v.id, gross];
        if (v.priceNet == null) return [v.id, null];
        const o = await offerBadgeFor(
          { slug: v.slug, brandSlug: product.brand?.slug ?? null, unitNet: v.priceNet },
          locale,
        );
        return [v.id, grossAmount(discountedNet(v.priceNet, o?.discountPercent ?? 0), { vatRate: v.vatRate })];
      }),
    ),
  );

  // ── Title, tags, codes ───────────────────────────────────────────────────
  const title = upGreek(pdpTitle(product.name, product.code2));
  const tag = platformTag(product.erpName);
  const platformText = tag ? withTrademark(tag) : null;
  const galleryTags: GalleryTag[] = [
    ...(platformText ? [{ text: platformText, tone: "ink" as const }] : []),
    ...(product.modelContent === "kit"
      ? [
          {
            text: kit ? t("tag_kit", { count: kit.batteries, ah: ahLabel(kit.ah) }) : t("opt_kit"),
            tone: "red" as const,
          },
        ]
      : []),
  ];
  const ean = product.code1 && product.code1 !== "—" ? product.code1 : null;
  const code = product.code2 || product.sku;

  // ── Key numbers ──────────────────────────────────────────────────────────
  const keys = keyNumbers(techRows, locale);
  const keyLabel = (key: (typeof keys)[number]) => {
    switch (key.key) {
      case "torque":
        return t("key_torque", { unit: key.unit });
      case "speed":
        return t("key_speed", { unit: key.unit });
      case "impact":
        return t("key_impact", { unit: key.unit });
      case "energy":
        return t("key_energy", { unit: key.unit });
      case "chuck":
        return t("key_chuck", { unit: key.unit });
      default:
        return t("key_drive");
    }
  };

  // ── Variants (bare / kit) ────────────────────────────────────────────────
  const kitCount = variants.filter((v) => v.content === "kit").length;
  const variantView = variants.map((v) => {
    const vModel = parseModel(v.name);
    const vFacts = boxFacts(parseTechBlock(v.longDescriptionEl));
    const vKit = v.content === "kit" ? (vFacts.batteries ?? (vModel?.kit ? { count: vModel.kit.batteries, ah: vModel.kit.ah } : null)) : null;

    let contents: string;
    if (v.content === "bare") {
      contents = vFacts.case ? t("desc_bare_case", { case: vFacts.case }) : t("desc_bare");
    } else {
      const parts: string[] = [];
      if (vKit) {
        const code = matchBattery(batteries, platform, vKit.ah)?.code;
        parts.push(
          code
            ? t("desc_batteries_code", { count: vKit.count, code, ah: ahLabel(vKit.ah) })
            : t("desc_batteries", { count: vKit.count, ah: ahLabel(vKit.ah) }),
        );
      }
      if (vFacts.charger != null)
        parts.push(vFacts.charger ? t("desc_charger", { model: vFacts.charger }) : t("desc_charger_plain"));
      if (vFacts.case) parts.push(vFacts.case);
      contents = parts.length ? `${parts.join(", ")}.` : "";
    }

    const name =
      v.content === "bare"
        ? t("opt_bare")
        : kitCount > 1 && vKit
          ? t("tag_kit", { count: vKit.count, ah: ahLabel(vKit.ah) })
          : t("opt_kit");
    const chip =
      v.content === "bare"
        ? t("chip_bare")
        : vKit
          ? t("tag_kit", { count: vKit.count, ah: ahLabel(vKit.ah) })
          : t("opt_kit");
    const g = variantGross.get(v.id) ?? null;
    return {
      id: v.id,
      slug: v.slug,
      current: v.id === product.id,
      name,
      chip,
      codes: [vModel?.code, v.code2].filter(Boolean).join(" · "),
      contents,
      price: g == null ? "—" : formatMoney(g, locale),
      gross: g,
      content: v.content,
      image: v.image,
    };
  });
  const showVariants = variantView.length > 1;
  const bareVariant = variantView.find((v) => v.content === "bare" && !v.current);
  const saving =
    product.modelContent === "kit" && bareVariant?.gross != null && gross != null
      ? gross - bareVariant.gross
      : null;

  // ── Availability ─────────────────────────────────────────────────────────
  // Our stock «Σε απόθεμα», no number («Τελευταίο τεμάχιο» at one); the
  // supplier's «Διαθέσιμο · 3–5 εργάσιμες»; neither «Παράδοση 1–3 εργάσιμες».
  const availability = availabilityOf(product);
  const stockLine =
    availability === "stock"
      ? isLastPiece(product.qty)
        ? t("teleftaio")
        : t("se_apothema")
      : availability === "supplier"
        ? t("diathesimo_3_5")
        : t("paradosi");

  // ── Sections ─────────────────────────────────────────────────────────────
  let paragraphs = descriptionParagraphs(product.longDescription);
  if (paragraphs.length === 0 && locale !== "el") paragraphs = descriptionParagraphs(product.longDescriptionEl);
  const photo = product.images[1]?.url ?? null;
  const specs = specTable(localTechRows.length > 0 ? localTechRows : techRows, locale);
  const half = Math.ceil(specs.length / 2);
  const box = inTheBox({
    facts: localizeBoxFacts(boxFacts(techRows), localTechRows),
    platform,
    isTool: product.modelRoot != null,
    kitFallback: product.modelContent === "kit" ? (model?.kit ?? null) : null,
    batteries,
  });
  const toolImage =
    variants.find((v) => v.content === "bare")?.image ?? product.images[0]?.url ?? null;

  const sections = [
    paragraphs.length > 0 && { id: "perigrafi", label: t("nav_perigrafi") },
    specs.length > 0 && { id: "prodiagrafes", label: t("nav_prodiagrafes") },
    box.length > 0 && { id: "syskevasia", label: t("nav_syskevasia") },
    product.documents.length > 0 && { id: "eggrafa", label: t("nav_eggrafa") },
    { id: "kritikes", label: t("nav_kritikes") },
  ].filter((s): s is { id: string; label: string } => Boolean(s));

  // ── Compare, band link ───────────────────────────────────────────────────
  const scopeKey = scopeKeyOf(product);
  const compared = compareSelection.slugs.includes(product.slug);
  const compare = {
    selected: compared,
    disabled:
      !compared &&
      (scopeKey == null ||
        compareSelection.slugs.length >= COMPARE_MAX ||
        (compareSelection.scopeKey != null && scopeKey !== compareSelection.scopeKey)),
  };
  const batteryCategory = rootCategories.find((c) => isBattery({ slug: c.slug, name: c.name }));
  const platformHref = platform
    ? `${batteryCategory ? `/katalogos/${batteryCategory.slug}` : "/katalogos"}?platform=${platform}`
    : null;
  const platformName = platform === "MX" ? "MX FUEL" : platform;

  const reviewCount = reviews.length;
  const average =
    reviewCount > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount : null;
  const formatAverage = (n: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

  // ── Structured data ──────────────────────────────────────────────────────
  /** Product JSON-LD — real values only; no invented ratings. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: displayName(product.name, product.code2),
    sku: code,
    mpn: product.code2 || undefined,
    ...(ean ? (ean.length === 13 ? { gtin13: ean } : { gtin: ean }) : {}),
    image: product.images.map((i) => i.url),
    description: product.shortDescription ?? paragraphs[0] ?? undefined,
    brand: { "@type": "Brand", name: "Milwaukee" },
    category: product.categoryChain.at(-1)?.name ?? undefined,
    /*
     * The offer has to agree with the Merchant Center feed, which Google reads
     * this page to keep current — out of stock is `OutOfStock`, not a promise
     * of `BackOrder`.
     */
    offers:
      product.priceNet != null
        ? {
            "@type": "Offer",
            url: absoluteUrl(`/proion/${product.slug}`, locale),
            price: grossAmount(product.priceNet, ctx).toFixed(2),
            priceCurrency: "EUR",
            itemCondition: "https://schema.org/NewCondition",
            availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            priceValidUntil: priceValidUntil(),
            shippingDetails: shippingDetails(locale),
            hasMerchantReturnPolicy: returnPolicy(),
          }
        : undefined,
    /* The manufacturer's figures, as data — the same rows as the table. */
    additionalProperty: specs.length
      ? specs.map((r) => ({ "@type": "PropertyValue", name: r.label, value: r.value }))
      : undefined,
    ...(average != null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: average.toFixed(1),
            reviewCount,
          },
        }
      : {}),
  };
  const breadcrumbLd = productBreadcrumb(locale, {
    name: displayName(product.name, product.code2),
    slug: product.slug,
    categories: product.categoryChain,
  });

  const crumbLast = product.modelRoot ?? displayName(product.name, product.code2);
  const priceDisabled = finalNet == null;

  return (
    <QuickViewProvider locale={locale}>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
        featured={null}
      />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <main id="main" className="hdc-pdp-page">
        <nav aria-label="Breadcrumb" className="hdc-wrap hdc-pdp-crumb">
          <Link href="/">{t("archiki")}</Link>
          {product.categoryChain.map((c) => (
            <span key={c.slug}>
              <i aria-hidden>/</i>
              <Link href={`/katalogos/${c.slug}`}>{c.name}</Link>
            </span>
          ))}
          <i aria-hidden>/</i>
          <span aria-current="page">{crumbLast}</span>
        </nav>

        {/* ═══ Gallery + buy box ═══ */}
        <div className="hdc-wrap hdc-pdp-top">
          <HdcGallery images={product.images} alt={displayName(product.name, product.code2)} tags={galleryTags} />

          <div className="hdc-pdp-buy">
            {platformText && <span className="hdc-slant hdc-pdp-tag hdc-pdp-tag--ink hdc-pdp-buytag">{platformText}</span>}
            <h1 className="hdc-disp hdc-pdp-h1">{title}</h1>

            <div className="hdc-pdp-codes">
              <span>
                {t("kodikos")} <b>{code}</b>
              </span>
              {model && (
                <span>
                  {t("montelo")} <b>{model.code}</b>
                </span>
              )}
              {ean && <span>EAN {ean}</span>}
            </div>
            <p className="hdc-pdp-mcodes">{[code, model?.code].filter(Boolean).join(" · ")}</p>

            {average != null ? (
              <a href="#kritikes" className="hdc-pdp-rv">
                ★ {formatAverage(average)} · {t("kritikes_count", { count: reviewCount })}
              </a>
            ) : (
              <a href="#kritikes" className="hdc-pdp-rv">
                {t("proti_kritiki")}
              </a>
            )}

            {keys.length >= 2 && (
              <div className="hdc-pdp-keys" style={{ "--keys": keys.length } as React.CSSProperties}>
                {keys.map((k) => (
                  <div key={k.key}>
                    <b>{k.value}</b>
                    <span>{keyLabel(k)}</span>
                  </div>
                ))}
              </div>
            )}

            {showVariants && (
              <div className="hdc-pdp-variants">
                <div className="hdc-pdp-lbl">
                  <span>{t("epiloges")}</span>
                  <details className="hdc-pdp-codehelp">
                    <summary>{t("ti_simainoun")}</summary>
                    <p>{t("ti_simainoun_apantisi")}</p>
                  </details>
                </div>
                <div className="hdc-pdp-opts">
                  {variantView.map((v) => {
                    const inner = (
                      <>
                        <span className="n">{v.name}</span>
                        <span className="m">{v.codes}</span>
                        <span className="d">{v.contents}</span>
                        <span className="p">{v.price}</span>
                      </>
                    );
                    return v.current ? (
                      <div key={v.id} className="hdc-pdp-opt on" aria-current="true">
                        {inner}
                      </div>
                    ) : (
                      <Link key={v.id} href={`/proion/${v.slug}`} className="hdc-pdp-opt" prefetch={false}>
                        {inner}
                      </Link>
                    );
                  })}
                </div>
                {saving != null && saving > 0 && platformName && (
                  <p className="hdc-pdp-hint">
                    {t.rich("hint", {
                      platform: platformName,
                      amount: formatMoney(saving, locale),
                      b: (chunks) => <b>{chunks}</b>,
                    })}
                  </p>
                )}
                {/* Phones: compact chips under the title (phone frame `.popts`). */}
                <div className="hdc-pdp-chips">
                  {variantView.map((v) =>
                    v.current ? (
                      <span key={v.id} className="on" aria-current="true">
                        {v.chip}
                        <b>{v.price}</b>
                      </span>
                    ) : (
                      <Link key={v.id} href={`/proion/${v.slug}`} prefetch={false}>
                        {v.chip}
                        <b>{v.price}</b>
                      </Link>
                    ),
                  )}
                </div>
              </div>
            )}

            <HdcSizePicker
              options={sizes}
              label={t("megethos")}
              status={
                sizes.some((s) => s.inStock)
                  ? t("megethi_diathesima", {
                      available: sizes.filter((s) => s.inStock).length,
                      total: sizes.length,
                    })
                  : t("megethi_kamia")
              }
              navLabel={t("megethos_epilogi")}
              titleOf={(s) =>
                s.inStock
                  ? t("megethos_kodikos", { size: s.label, code: s.code })
                  : s.supplierAvailable
                    ? t("megethos_3_5", { size: s.label, code: s.code })
                    : t("megethos_paraggelia", { size: s.label, code: s.code })
              }
            />

            <div className="hdc-pdp-pricebox">
              <p className="hdc-pdp-pr">
                {price}
                {discounted && product.priceNet != null && (
                  <s>{formatMoney(grossAmount(product.priceNet, ctx), locale)}</s>
                )}
                <small>{t("me_fpa")}</small>
              </p>
              <div className="hdc-pdp-avail">
                <div className={availability === "stock" ? "ok" : "wait"}>
                  <span className="dot" aria-hidden />
                  <span>{stockLine}</span>
                </div>
                <div>
                  <span className="dot dot--ink" aria-hidden />
                  <span>
                    {t("paralavi")} <span className="g">· {t("paralavi_topos")}</span>
                  </span>
                </div>
                <div>
                  <span className="dot dot--ink" aria-hidden />
                  <span>
                    {t("dorean_apostoli")}{" "}
                    <span className="g">· {t("dorean_orio", { amount: FREE_SHIPPING_THRESHOLD_NET })}</span>
                  </span>
                </div>
              </div>
              <HdcBuyActions
                productId={product.id}
                slug={product.slug}
                disabled={priceDisabled}
                favourite={favourites.has(product.id)}
                compare={compare}
                questionHref={`/epikoinonia?product=${encodeURIComponent(code)}`}
                shareTitle={displayName(product.name, product.code2)}
              />
            </div>

            <div className="hdc-pdp-serv">
              <div>
                <b>{t("serv_apostoli_t")}</b>
                <span>{t("serv_apostoli_d", { amount: FREE_SHIPPING_THRESHOLD_NET })}</span>
              </div>
              <div>
                <b>{t("serv_paralavi_t")}</b>
                <span>{t("serv_paralavi_d")}</span>
              </div>
              <div>
                <b>{t("serv_eggyisi_t")}</b>
                <span>{t("serv_eggyisi_d")}</span>
              </div>
              <div>
                <b>{t("serv_pliromi_t")}</b>
                <span>{t("serv_pliromi_d")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Section bar ═══ */}
        <HdcSectionNav
          sections={sections}
          price={price}
          productId={product.id}
          disabled={priceDisabled}
          label={t("nav_label")}
          addLabel={t("sto_kalathi")}
        />

        <div className="hdc-wrap hdc-pdp-sections">
          {paragraphs.length > 0 && (
            <HdcSection id="perigrafi" title={t("nav_perigrafi")}>
              <div className={`hdc-pdp-ov${photo ? "" : " hdc-pdp-ov--full"}`}>
                <div>
                  {paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                {photo && (
                  <figure className="hdc-pdp-ph">
                    {/* eslint-disable-next-line @next/next/no-img-element -- CDN WebP; the optimiser is off */}
                    <img src={photo} alt={displayName(product.name, product.code2)} loading="lazy" />
                    {product.modelRoot && <figcaption>{product.modelRoot}</figcaption>}
                  </figure>
                )}
              </div>
            </HdcSection>
          )}

          {specs.length > 0 && (
            <HdcSection id="prodiagrafes" title={t("nav_prodiagrafes")} defaultOpen>
              <div className="hdc-pdp-specs">
                {[specs.slice(0, half), specs.slice(half)].map((column, i) =>
                  column.length ? (
                    <dl key={i}>
                      {column.map((r) => (
                        <div key={r.label}>
                          <dt>{r.label}</dt>
                          <dd>{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null,
                )}
              </div>
            </HdcSection>
          )}

          {box.length > 0 && (
            <HdcSection id="syskevasia" title={t("nav_syskevasia")}>
              <div className="hdc-pdp-box">
                {box.map((tile, i) => {
                  switch (tile.kind) {
                    case "tool":
                      return (
                        <div key={i}>
                          <div className="im">
                            <span className="x">{tile.qty}</span>
                            {toolImage && (
                              // eslint-disable-next-line @next/next/no-img-element -- CDN WebP; the optimiser is off
                              <img src={toolImage} alt="" loading="lazy" />
                            )}
                          </div>
                          <div className="t">
                            {pdpTitle(product.name, product.code2)}
                            <small>{t("box_tool_sub")}</small>
                          </div>
                        </div>
                      );
                    case "battery": {
                      const battery = tile.product;
                      const label = t("box_battery_title", {
                        platform: platform ?? "",
                        ah: ahLabel(tile.ah),
                      });
                      return battery ? (
                        <Link key={i} href={`/proion/${battery.slug}`} prefetch={false}>
                          <div className="im">
                            <span className="x">{tile.qty}</span>
                            {battery.image && (
                              // eslint-disable-next-line @next/next/no-img-element -- CDN WebP; the optimiser is off
                              <img src={battery.image} alt="" loading="lazy" />
                            )}
                          </div>
                          <div className="t">
                            {displayName(battery.name, battery.code2)}
                            <small>
                              {ahLabel(tile.ah)}Ah · {battery.code2}
                            </small>
                          </div>
                        </Link>
                      ) : (
                        <div key={i}>
                          <div className="im ph">
                            <span className="x">{tile.qty}</span>
                            {t("box_battery_ph")}
                          </div>
                          <div className="t">
                            {label}
                            <small>{t("box_battery_sub")}</small>
                          </div>
                        </div>
                      );
                    }
                    case "charger":
                      return (
                        <div key={i}>
                          <div className="im ph">
                            <span className="x">{tile.qty}</span>
                            {t("box_charger_ph")}
                          </div>
                          <div className="t">
                            {tile.model ? t("box_charger_title", { model: tile.model }) : t("box_charger_plain")}
                            <small>
                              {/M12/.test(tile.model) && /M18/.test(tile.model)
                                ? t("box_charger_both")
                                : t("box_charger_sub")}
                            </small>
                          </div>
                        </div>
                      );
                    case "case":
                      return (
                        <div key={i}>
                          <div className="im ph">
                            <span className="x">{tile.qty}</span>
                            {upGreek(tile.value)}
                          </div>
                          <div className="t">
                            {tile.value}
                            <small>{t("box_case_sub")}</small>
                          </div>
                        </div>
                      );
                    case "accessories":
                      return (
                        <div key={i}>
                          <div className="im ph">
                            <span className="x">{tile.qty}</span>
                            {t("box_acc_ph")}
                          </div>
                          <div className="t">
                            {tile.items
                              .join(", ")
                              .replace(/^./, (c) => c.toLocaleUpperCase(locale))}
                            <small>{t("box_acc_sub")}</small>
                          </div>
                        </div>
                      );
                  }
                })}
              </div>
            </HdcSection>
          )}

          {product.documents.length > 0 && (
            <HdcSection id="eggrafa" title={t("nav_eggrafa")}>
              <div className="hdc-pdp-docs">
                {product.documents.map((doc, i) => (
                  <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer">
                    <i>PDF</i>
                    <div>
                      <b>{t("eggrafo", { n: i + 1 })}</b>
                      <span>{decodeURIComponent(doc.url.split("/").pop()?.split("?")[0] ?? "")}</span>
                    </div>
                  </a>
                ))}
              </div>
            </HdcSection>
          )}

          <HdcSection id="kritikes" title={t("nav_kritikes")}>
            {reviewCount === 0 ? (
              <div className="hdc-pdp-rev">
                <div>
                  <h3>{t("rev_empty_t")}</h3>
                  <p>{t("rev_empty_d")}</p>
                </div>
                <Link href="/logariasmos/axiologiseis" className="hdc-btn hdc-btn-ink" prefetch={false}>
                  {t("rev_write")}
                </Link>
              </div>
            ) : (
              <>
                <div className="hdc-pdp-rev-head">
                  <b>★ {formatAverage(average ?? 0)}</b>
                  <span>
                    {t("kritikes_count", { count: reviewCount })} · {t("rev_note")}
                  </span>
                  <Link href="/logariasmos/axiologiseis" className="hdc-btn hdc-btn-ink" prefetch={false}>
                    {t("rev_write")}
                  </Link>
                </div>
                <ul className="hdc-pdp-revs">
                  {reviews.map((r) => (
                    <li key={r.id}>
                      <div>
                        <span className="stars" aria-label={t("asteria", { n: r.rating })}>
                          {"★".repeat(r.rating)}
                          <span aria-hidden>{"★".repeat(5 - r.rating)}</span>
                        </span>
                        <time dateTime={r.createdAt.toISOString()}>
                          {r.createdAt.toLocaleDateString(locale === "el" ? "el-GR" : locale)}
                        </time>
                      </div>
                      {r.title && <b>{r.title}</b>}
                      <p>{r.body}</p>
                      <small>
                        {r.customer.firstName.trim()}
                        {r.customer.lastName.trim() ? ` ${r.customer.lastName.trim().charAt(0)}.` : ""}
                      </small>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </HdcSection>
        </div>

        <Zone id="product.aboveRelated" locale={locale} />

        {/* ═══ Same battery ═══ */}
        {platform && bandCards.length > 0 && (
          <section className="hdc-pdp-xs">
            <div className="hdc-wrap">
              <div className="hdc-pdp-xs-head">
                <div>
                  <h2 className="hdc-disp">{t("xs_title")}</h2>
                  <p>
                    {product.modelContent === "kit"
                      ? t("xs_lead_kit", { platform: platformName ?? platform })
                      : t("xs_lead", { platform: platformName ?? platform })}
                  </p>
                </div>
                {platformHref && (
                  <Link href={platformHref} prefetch={false}>
                    {t("xs_all", { platform: platformName ?? platform })}
                  </Link>
                )}
              </div>
              <div className="hdc-pdp-xs-grid">
                {bandCards.map((card) => (
                  <HdcProductCard key={card.id} product={card} />
                ))}
              </div>
            </div>
          </section>
        )}

        <Zone id="product.middle" locale={locale} />
        <Zone id="product.below" locale={locale} />

        {/* Phones: price and «ΣΤΟ ΚΑΛΑΘΙ» always in reach (phone frame `.bar`). */}
        <div className="hdc-pdp-mbar">
          <div className="pp">
            <b>{price}</b>
            <span>{t("me_fpa")}</span>
          </div>
          <AddToCartButton productId={product.id} disabled={priceDisabled} label={t("sto_kalathi")} className="hdc-pdp-mbar-add" />
        </div>
      </main>

      <SiteFooter categories={rootCategories} />
    </QuickViewProvider>
  );
}
