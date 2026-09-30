import "server-only";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { availabilityOf } from "@/lib/catalog/availability";
import { categoryGreekTexts } from "@/lib/catalog/category-names";
import { getGreekLexicon } from "@/lib/catalog/greek-lexicon";
import { getModelProducts, type ModelProduct } from "@/lib/catalog/models";
import { getPlpSummary } from "@/lib/catalog/plp";
import { getProductBySlug } from "@/lib/catalog/pdp";
import { parseModel } from "@/lib/milwaukee/model";
import { ahLabel, boxFacts, keyNumbers } from "@/lib/milwaukee/pdp";
import { parseTechBlock } from "@/lib/milwaukee/tech-block";
import { categoryFaq, categoryIntro } from "@/lib/seo/category-copy";
import { accentedName, categoryDescription, categoryTitle } from "@/lib/seo/category-seo";
import { HUBS, type HubKey } from "@/lib/seo/hubs";
import { modelAnswer, modelDescription, modelFaq, modelH1, modelTitle, type ModelCopyInput } from "@/lib/seo/model-copy";
import { greekKind, productDescription, productH1, productTitle } from "@/lib/seo/product-seo";
import type { AutoSeo } from "@/lib/seo/seo-merge";

/**
 * The AUTOMATIC Greek SEO text of each kind of page — what shows when its
 * SeoOverride leaves a field empty. One place for the pages (which merge the
 * override over it with `seoFor`) and for the admin, which shows it as the
 * placeholder of every field so an editor sees what they are replacing.
 */

export async function autoCategorySeo(slug: string): Promise<(AutoSeo & { name: string }) | null> {
  const category = await prisma.category.findUnique({
    where: { slug },
    select: { erpType: true, erpCode: true, nameEl: true, productCount: true, childCount: true },
  });
  if (!category) return null;
  const [summary, texts, lexicon, t] = await Promise.all([
    getPlpSummary({ categorySlug: slug }, "el"),
    categoryGreekTexts(category.erpType, category.erpCode),
    getGreekLexicon(),
    getTranslations({ locale: "el", namespace: "katalogos.page" }),
  ]);
  const name = accentedName(category.nameEl, texts, lexicon);
  const platforms = (["M12", "M18", "MX"] as const)
    .filter((p) => summary.platforms[p] > 0)
    .map((p) => (p === "MX" ? "MX FUEL" : p));
  const children = summary.subcategories
    .filter((c) => c.count > 0)
    .map((c) => accentedName(c.label, texts, lexicon))
    .filter((c) => /\p{Ll}/u.test(c));
  const total = summary.platforms.all;
  const copy = { name, total, facets: summary };
  return {
    name,
    h1: name,
    title: categoryTitle({ name, platforms }),
    description:
      total > 0
        ? categoryDescription({ name, total, platforms, children })
        : t("kodikoi_se_ypokatigories_amesi_diathesimotita", {
            productCount: category.productCount,
            childCount: category.childCount,
          }),
    intro: categoryIntro(copy),
    faq: categoryFaq(copy),
  };
}

export async function autoHubSeo(key: HubKey, locale: "el" | "en" | "it" = "el"): Promise<AutoSeo> {
  const t = await getTranslations({ locale, namespace: "seoPages" });
  const hub = HUBS[key];
  const h1 = t(`hub_${hub.msg}_h1`);
  const lead = t(`hub_${hub.msg}_lead`);
  return { h1, title: h1, description: lead, intro: lead };
}

/** What a kit holds, in the words of its own «Τεχνικά χαρακτηριστικά» block. */
export function kitContents(product: Pick<ModelProduct, "content" | "longDescriptionEl" | "name">): string | null {
  if (product.content !== "kit") return null;
  const facts = boxFacts(parseTechBlock(product.longDescriptionEl));
  const fromName = parseModel(product.name)?.kit ?? null;
  const kit = facts.batteries
    ? { count: facts.batteries.count, ah: facts.batteries.ah }
    : fromName
      ? { count: fromName.batteries, ah: fromName.ah }
      : null;
  const parts: string[] = [];
  if (kit) parts.push(`${kit.count} ${kit.count === 1 ? "μπαταρία" : "μπαταρίες"} ${ahLabel(kit.ah)} Ah`);
  if (facts.charger != null) parts.push(facts.charger ? `φορτιστή ${facts.charger}` : "φορτιστή");
  if (facts.case) parts.push(facts.case);
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} και ${parts.at(-1)}`;
}

/** The model page's copy input and automatic text, or null for a model the store does not list. */
export async function autoModelSeo(root: string): Promise<{ input: ModelCopyInput; products: ModelProduct[]; auto: AutoSeo } | null> {
  const products = await getModelProducts(root);
  if (products.length === 0) return null;
  const lead = products.find((p) => p.content === "bare") ?? products[0];
  const parsed = parseModel(lead.name);
  const techRows = parseTechBlock(lead.longDescriptionEl);
  const input: ModelCopyInput = {
    root,
    kind: greekKind({
      erpName: lead.name,
      code2: lead.code2,
      greekTexts: [lead.shortDescriptionEl, lead.longDescriptionEl],
      lexicon: await getGreekLexicon(),
    }),
    platform: lead.platform ?? parsed?.platform ?? "M18",
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
  return {
    input,
    products,
    auto: {
      h1: modelH1(input),
      title: modelTitle(input),
      description: modelDescription(input),
      intro: modelAnswer(input),
      faq: modelFaq(input),
    },
  };
}

/** A product's automatic Greek H1, <title> and description (not for a size of a family). */
export async function autoProductSeo(slug: string): Promise<AutoSeo | null> {
  const product = await getProductBySlug(slug, "el");
  if (!product) return null;
  const input = {
    locale: "el" as const,
    name: product.name,
    erpName: product.erpName,
    code2: product.code2 || product.sku,
    greekTexts: [product.shortDescription, product.longDescriptionEl],
    lexicon: await getGreekLexicon(),
  };
  return {
    h1: productH1(input),
    title: productTitle(input),
    description: productDescription({
      ...input,
      availability: availabilityOf(product),
      qty: product.qty,
      keySpec: keyNumbers(parseTechBlock(product.longDescriptionEl), "el")[0] ?? null,
    }),
  };
}
