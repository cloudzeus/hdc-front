import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FaqSection } from "@/components/blog/ArticleView";
import { HdcContentPage } from "@/components/content/HdcContentPage";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { availabilityLabelKey, availabilityOf } from "@/lib/catalog/availability";
import { getGreekLexicon } from "@/lib/catalog/greek-lexicon";
import { getModelProducts, type ModelProduct } from "@/lib/catalog/models";
import { formatMoney, grossAmount } from "@/lib/format";
import { parseModel } from "@/lib/milwaukee/model";
import { modelPath, modelRootFromSlug, modelSlug } from "@/lib/milwaukee/model-slug";
import { ahLabel, boxFacts, keyNumbers, specTable } from "@/lib/milwaukee/pdp";
import { parseTechBlock } from "@/lib/milwaukee/tech-block";
import { discountedNet, offerBadgeFor } from "@/lib/offers/badges";
import { hubForPlatform } from "@/lib/seo/hubs";
import { renderMarkdown } from "@/lib/seo/markdown";
import {
  modelAnswer,
  modelDescription,
  modelFaq,
  modelH1,
  modelTitle,
  type ModelCopyInput,
} from "@/lib/seo/model-copy";
import { faqJsonLd } from "@/lib/seo/product-faq";
import { modelGroupJsonLd } from "@/lib/seo/product-schema";
import { greekKind } from "@/lib/seo/product-seo";
import { seoFor } from "@/lib/seo/seo-for";
import { breadcrumbJsonLd } from "@/lib/seo/structured-data";
import { absoluteUrl, pageMeta, siteOrigin } from "@/lib/seo/urls";

/**
 * A model page: /montelo/m18-fpd3 — the bare tool and every kit of one
 * Milwaukee model, with their article numbers, EAN, price and availability,
 * the manufacturer's figures and a FAQ built from the same data.
 *
 * It exists while the store lists at least one version of the model; an
 * unknown model is a real 404 (no loading.tsx above this route). The copy is
 * automatic (src/lib/seo/model-copy.ts) under the MODEL SeoOverride, if any.
 */

type PageProps = { params: Promise<{ locale: Locale; model: string }> };

/** What a kit holds, in the words of its own «Τεχνικά χαρακτηριστικά» block. */
function kitContents(product: ModelProduct): string | null {
  if (product.content !== "kit") return null;
  const facts = boxFacts(parseTechBlock(product.longDescriptionEl));
  const kit = facts.batteries ?? parseModel(product.name)?.kit ?? null;
  const parts: string[] = [];
  if (kit) {
    const count = "count" in kit ? kit.count : kit.batteries;
    parts.push(`${count} ${count === 1 ? "μπαταρία" : "μπαταρίες"} ${ahLabel(kit.ah)} Ah`);
  }
  if (facts.charger != null) parts.push(facts.charger ? `φορτιστή ${facts.charger}` : "φορτιστή");
  if (facts.case) parts.push(facts.case);
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} και ${parts.at(-1)}`;
}

async function loadModel(slug: string, locale: Locale) {
  const root = modelRootFromSlug(slug);
  if (!root) return null;
  const products = await getModelProducts(root);
  if (products.length === 0) return null;

  const lead = products.find((p) => p.content === "bare") ?? products[0];
  const parsed = parseModel(lead.name);
  const platform = lead.platform ?? parsed?.platform ?? "M18";
  const techRows = parseTechBlock(lead.longDescriptionEl);
  const input: ModelCopyInput = {
    root,
    kind: greekKind({
      erpName: lead.name,
      code2: lead.code2,
      greekTexts: [lead.shortDescriptionEl, lead.longDescriptionEl],
      lexicon: await getGreekLexicon(),
    }),
    platform,
    fuel: parsed?.fuel ?? false,
    keySpec: keyNumbers(techRows, "el")[0] ?? null,
    versions: products.map((p) => ({
      code: parseModel(p.name)?.code ?? p.code2,
      code2: p.code2,
      content: p.content,
      contents: kitContents(p),
      availability: availabilityOf(p),
    })),
  };
  const seo = await seoFor("MODEL", root, locale, {
    h1: modelH1(input),
    title: modelTitle(input),
    description: modelDescription(input),
    intro: modelAnswer(input),
    faq: modelFaq(input),
  });
  return { root, products, lead, input, seo, techRows };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, model } = await params;
  const data = await loadModel(model, locale);
  if (!data) return {};
  return {
    ...pageMeta({
      path: modelPath(data.root),
      locale,
      title: data.seo.title,
      description: data.seo.description,
      image: data.lead.image ?? undefined,
    }),
    title: { absolute: data.seo.title },
    description: data.seo.description,
  };
}

export default async function ModelPage({ params }: PageProps) {
  const { locale, model } = await params;
  setRequestLocale(locale);

  const data = await loadModel(model, locale);
  if (!data) notFound();
  // One address per model: /montelo/M18-FPD3 → /montelo/m18-fpd3.
  if (model !== modelSlug(data.root)) permanentRedirect(modelPath(data.root));

  const t = await getTranslations("seoPages");
  const { root, products, lead, input, seo, techRows } = data;
  const hub = hubForPlatform(input.platform);

  const rows = await Promise.all(
    products.map(async (p, i) => {
      const offer =
        p.priceNet == null ? null : await offerBadgeFor({ slug: p.slug, brandSlug: p.brandSlug, unitNet: p.priceNet }, locale);
      const gross =
        p.priceNet == null ? null : grossAmount(discountedNet(p.priceNet, offer?.discountPercent ?? 0), { vatRate: p.vatRate });
      const availability = availabilityOf(p);
      const version = input.versions[i];
      return {
        product: p,
        code: version.code,
        contents:
          p.content === "bare"
            ? t("mono_ergaleio")
            : locale === "el" && version.contents
              ? version.contents.charAt(0).toLocaleUpperCase("el") + version.contents.slice(1)
              : p.content === "kit"
                ? t("kit")
                : "—",
        ean: p.code1?.trim() || null,
        gross,
        availability,
        availabilityText: t(availabilityLabelKey(availability, p.qty)),
      };
    }),
  );

  const specs = specTable(techRows, "el");
  const url = absoluteUrl(modelPath(root), "el");
  const faqLd = faqJsonLd(seo.faq);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        ...modelGroupJsonLd({
          url,
          origin: siteOrigin(),
          root,
          name: seo.h1,
          description: seo.intro,
          image: lead.image,
          versions: rows.map((r) => ({
            url: absoluteUrl(`/proion/${r.product.slug}`, "el"),
            name: `Milwaukee ${r.code}`,
            code: r.code,
            code2: r.product.code2,
            ean: r.ean,
            image: r.product.image,
            priceGross: r.gross,
            availability: r.availability,
          })),
        }),
        "@context": undefined,
      },
      ...(faqLd ? [{ ...faqLd, "@context": undefined, inLanguage: "el-GR" }] : []),
      {
        ...breadcrumbJsonLd(
          [
            { name: "Αρχική", path: "/" },
            { name: hub.label, path: hub.path },
            { name: `Milwaukee ${root}`, path: modelPath(root) },
          ],
          "el",
        ),
        "@context": undefined,
      },
    ],
  };

  return (
    <HdcContentPage locale={locale} title={seo.h1} trail={[{ href: hub.path, label: hub.label }]} jsonLd={jsonLd}>
      {locale !== "el" && (
        <p className="hdc-cp-meta">
          <span className="hdc-cp-lang" lang={locale}>
            {t("mono_ellinika")}
          </span>
        </p>
      )}

      {seo.intro && (
        <div className="hdc-answer" lang="el">
          <p>{seo.intro}</p>
        </div>
      )}

      <section className="hdc-hub-block" aria-labelledby="ekdoseis">
        <h2 id="ekdoseis">{t("ekdoseis_kodikoi")}</h2>
        <table className="hdc-versions">
          <thead>
            <tr>
              <th scope="col">{t("th_ekdosi")}</th>
              <th scope="col">{t("th_periechomeno")}</th>
              <th scope="col">{t("th_kodikos")}</th>
              <th scope="col">{t("th_ean")}</th>
              <th scope="col">{t("th_timi")}</th>
              <th scope="col">{t("th_diathesimotita")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.product.id}>
                <td>
                  <Link href={`/proion/${r.product.slug}`} prefetch={false}>
                    {r.code}
                  </Link>
                </td>
                <td data-label={t("th_periechomeno")} lang="el">
                  {r.contents}
                </td>
                <td data-label={t("th_kodikos")}>
                  <b>{r.product.code2}</b>
                </td>
                <td data-label={t("th_ean")}>{r.ean ?? "—"}</td>
                <td data-label={t("th_timi")} className="num">
                  {r.gross == null ? "—" : `${formatMoney(r.gross, locale)} ${t("me_fpa")}`}
                </td>
                <td data-label={t("th_diathesimotita")} className={r.availability === "stock" ? "ok" : "wait"}>
                  {r.availabilityText}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {specs.length > 0 && (
        <section className="hdc-hub-block" aria-labelledby="techn">
          <h2 id="techn">{t("techn_char")}</h2>
          <dl className="hdc-specs" lang="el">
            {specs.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="hdc-sources">{t("techn_pigi", { code: input.versions[products.indexOf(lead)]?.code ?? root })}</p>
        </section>
      )}

      {seo.body && <div className="hdc-prose hdc-hub-block" lang="el" dangerouslySetInnerHTML={{ __html: renderMarkdown(seo.body) }} />}

      <div lang="el">
        <FaqSection title={t("syxnes_erotiseis")} faq={seo.faq} />
      </div>
    </HdcContentPage>
  );
}
