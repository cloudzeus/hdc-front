import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma, type ContentKind, type ContentStatus, type SeoTargetType } from "@/generated/prisma/client";
import { modelRootFromSlug } from "@/lib/milwaukee/model-slug";
import { getModelProducts } from "@/lib/catalog/models";
import { internalLinks } from "@/lib/seo/seo-checks";
import { faqFromJson, stringsFromJson } from "@/lib/seo/seo-merge";
import { HUBS, HUB_KEYS } from "@/lib/seo/hubs";
import type { FaqPair } from "@/lib/seo/product-faq";

/**
 * Reads and writes of the «SEO & Περιεχόμενο» admin (/admin/seo). The actions
 * check the capability and write the audit log; this only talks to the
 * database.
 */

// ── Articles and guides ─────────────────────────────────────────────────────

export type ArticleRow = {
  id: string;
  kind: ContentKind;
  slug: string;
  status: ContentStatus;
  title: string;
  seoTitle: string | null;
  metaDescription: string | null;
  hasFaq: boolean;
  heroImageUrl: string | null;
  /** AUTO: written by the automatic writer (src/lib/content-auto). */
  source: "MANUAL" | "AUTO";
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: string;
};

export async function listArticles(filter: {
  kind?: ContentKind | null;
  status?: ContentStatus | null;
  q?: string | null;
}): Promise<ArticleRow[]> {
  const q = filter.q?.trim();
  const rows = await prisma.contentArticle.findMany({
    where: {
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(q
        ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: [{ status: "asc" }, { kind: "asc" }, { title: "asc" }],
    select: {
      id: true,
      kind: true,
      slug: true,
      status: true,
      title: true,
      seoTitle: true,
      metaDescription: true,
      faq: true,
      heroImageUrl: true,
      publishedAt: true,
      updatedAt: true,
      updatedBy: true,
      source: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    hasFaq: faqFromJson(r.faq).length > 0,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export type ArticleForm = {
  id: string | null;
  kind: ContentKind;
  slug: string;
  status: ContentStatus;
  title: string;
  seoTitle: string;
  metaDescription: string;
  answer: string;
  body: string;
  faq: FaqPair[];
  keywords: string[];
  entities: string[];
  sources: string[];
  heroImageUrl: string;
  heroImageAlt: string;
  publishedAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export async function getArticleForm(id: string): Promise<ArticleForm | null> {
  const r = await prisma.contentArticle.findUnique({ where: { id } });
  if (!r) return null;
  return {
    id: r.id,
    kind: r.kind,
    slug: r.slug,
    status: r.status,
    title: r.title,
    seoTitle: r.seoTitle ?? "",
    metaDescription: r.metaDescription ?? "",
    answer: r.answer ?? "",
    body: r.body,
    faq: faqFromJson(r.faq),
    keywords: stringsFromJson(r.keywords),
    entities: stringsFromJson(r.entities),
    sources: stringsFromJson(r.sources),
    heroImageUrl: r.heroImageUrl ?? "",
    heroImageAlt: r.heroImageAlt ?? "",
    publishedAt: r.publishedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
    updatedBy: r.updatedBy,
  };
}

export function emptyArticleForm(kind: ContentKind): ArticleForm {
  return {
    id: null,
    kind,
    slug: "",
    status: "DRAFT",
    title: "",
    seoTitle: "",
    metaDescription: "",
    answer: "",
    body: "",
    faq: [],
    keywords: [],
    entities: [],
    sources: [],
    heroImageUrl: "",
    heroImageAlt: "",
    publishedAt: null,
    updatedAt: null,
    updatedBy: null,
  };
}

// ── Page SEO overrides ──────────────────────────────────────────────────────

export type OverrideForm = {
  h1: string;
  seoTitle: string;
  metaDescription: string;
  intro: string;
  body: string;
  faq: FaqPair[];
  updatedAt: string | null;
  updatedBy: string | null;
};

export async function getOverrideForm(targetType: SeoTargetType, targetKey: string): Promise<OverrideForm> {
  const r = await prisma.seoOverride.findUnique({ where: { targetType_targetKey: { targetType, targetKey } } });
  return {
    h1: r?.h1 ?? "",
    seoTitle: r?.seoTitle ?? "",
    metaDescription: r?.metaDescription ?? "",
    intro: r?.intro ?? "",
    body: r?.body ?? "",
    faq: faqFromJson(r?.faq),
    updatedAt: r?.updatedAt.toISOString() ?? null,
    updatedBy: r?.updatedBy ?? null,
  };
}

/** Saves the filled fields; an override with nothing left in it is removed. */
export async function saveOverride(
  targetType: SeoTargetType,
  targetKey: string,
  form: Omit<OverrideForm, "updatedAt" | "updatedBy">,
  actor: string,
): Promise<"saved" | "cleared"> {
  const clean = (v: string) => (v.trim() ? v.trim() : null);
  const faq = form.faq.filter((p) => p.q.trim() && p.a.trim()).map((p) => ({ q: p.q.trim(), a: p.a.trim() }));
  const data = {
    h1: clean(form.h1),
    seoTitle: clean(form.seoTitle),
    metaDescription: clean(form.metaDescription),
    intro: clean(form.intro),
    body: clean(form.body),
    faq: faq.length ? faq : Prisma.DbNull,
    updatedBy: actor.slice(0, 120),
  };
  const where = { targetType_targetKey: { targetType, targetKey } };
  const empty = !data.h1 && !data.seoTitle && !data.metaDescription && !data.intro && !data.body && faq.length === 0;
  const existing = await prisma.seoOverride.findUnique({ where });
  if (empty) {
    // Keep keywords/sources the importer brought in; clear only the page text.
    if (existing) await prisma.seoOverride.update({ where, data });
    return "cleared";
  }
  if (existing) await prisma.seoOverride.update({ where, data });
  else await prisma.seoOverride.create({ data: { ...data, targetType, targetKey } });
  return "saved";
}

// ── Link checks ─────────────────────────────────────────────────────────────

/**
 * Which internal paths do not lead anywhere: a category, product, model,
 * article, guide or hub that does not exist (or is not live). Static pages are
 * trusted. One query per kind of path.
 */
export async function brokenLinks(paths: string[]): Promise<string[]> {
  const by = (prefix: string) =>
    paths.filter((p) => p.startsWith(prefix)).map((p) => decodeURIComponent(p.slice(prefix.length).split("/")[0] ?? ""));
  const [cats, prods, arts] = await Promise.all([
    prisma.category.findMany({ where: { slug: { in: by("/katalogos/") }, productCount: { gt: 0 } }, select: { slug: true } }),
    prisma.product.findMany({ where: { slug: { in: by("/proion/") }, isActive: true }, select: { slug: true } }),
    prisma.contentArticle.findMany({
      where: { slug: { in: [...by("/blog/"), ...by("/odigoi/")] }, status: "PUBLISHED" },
      select: { slug: true, kind: true },
    }),
  ]);
  const ok = new Set<string>([
    ...cats.map((c) => `/katalogos/${c.slug}`),
    ...prods.map((p) => `/proion/${p.slug}`),
    ...arts.map((a) => `${a.kind === "GUIDE" ? "/odigoi" : "/blog"}/${a.slug}`),
    ...HUB_KEYS.map((k) => HUBS[k].path),
  ]);
  const broken: string[] = [];
  for (const path of paths) {
    if (ok.has(path)) continue;
    if (path.startsWith("/montelo/")) {
      const root = modelRootFromSlug(path.slice("/montelo/".length));
      if (root && (await getModelProducts(root)).length > 0) continue;
      broken.push(path);
      continue;
    }
    if (/^\/(katalogos|proion|blog|odigoi)\/./.test(path)) broken.push(path);
  }
  return broken;
}

export async function brokenLinksIn(markdown: string | null | undefined): Promise<string[]> {
  return brokenLinks(internalLinks(markdown));
}

// ── SEO check ───────────────────────────────────────────────────────────────

export type AuditItem = { label: string; href: string; detail?: string };
export type AuditGroup = { id: string; title: string; total: number; items: AuditItem[]; fix: string };

const SAMPLE = 25;

/** Problems worth fixing, each with where to fix it. */
export async function seoAudit(): Promise<AuditGroup[]> {
  const [noImage, noImageCount, noDescription, noDescriptionCount, longTitles, categories, categoryIntros, drafts, duplicates] =
    await Promise.all([
      prisma.product.findMany({ where: { isActive: true, images: { none: {} } }, select: { slug: true, name: true, code2: true }, take: SAMPLE }),
      prisma.product.count({ where: { isActive: true, images: { none: {} } } }),
      prisma.product.findMany({
        where: { isActive: true, translations: { none: { locale: "el", shortDescription: { not: null } } } },
        select: { slug: true, name: true, code2: true },
        take: SAMPLE,
      }),
      prisma.product.count({ where: { isActive: true, translations: { none: { locale: "el", shortDescription: { not: null } } } } }),
      prisma.seoOverride.findMany({ where: { targetType: "PRODUCT", seoTitle: { not: null } }, select: { targetKey: true, seoTitle: true } }),
      prisma.category.findMany({ where: { productCount: { gt: 0 } }, select: { slug: true, nameEl: true, productCount: true }, orderBy: { productCount: "desc" } }),
      prisma.seoOverride.findMany({ where: { targetType: "CATEGORY", intro: { not: null } }, select: { targetKey: true } }),
      prisma.contentArticle.findMany({ where: { status: "DRAFT" }, select: { id: true, title: true, faq: true } }),
      prisma.product.groupBy({ by: ["code2"], where: { isActive: true, code2: { not: "" } }, _count: { _all: true }, having: { code2: { _count: { gt: 1 } } } }),
    ]);

  const withIntro = new Set(categoryIntros.map((c) => c.targetKey));
  const noIntro = categories.filter((c) => !withIntro.has(c.slug));
  const noFaq = drafts.filter((d) => faqFromJson(d.faq).length === 0);
  const tooLong = longTitles.filter((o) => (o.seoTitle ?? "").length > 65);

  // Links in every article and every page text that lead nowhere.
  const [articles, overrides] = await Promise.all([
    prisma.contentArticle.findMany({ select: { id: true, title: true, body: true } }),
    prisma.seoOverride.findMany({ where: { body: { not: null } }, select: { targetType: true, targetKey: true, body: true } }),
  ]);
  const brokenItems: AuditItem[] = [];
  for (const a of articles) {
    for (const path of await brokenLinksIn(a.body)) {
      brokenItems.push({ label: a.title, href: `/admin/seo?tab=articles&edit=${a.id}`, detail: path });
    }
  }
  for (const o of overrides) {
    const tab = o.targetType === "CATEGORY" ? "categories" : o.targetType === "PRODUCT" ? "products" : "hubs";
    for (const path of await brokenLinksIn(o.body)) {
      brokenItems.push({ label: `${o.targetType} ${o.targetKey}`, href: `/admin/seo?tab=${tab}&key=${encodeURIComponent(o.targetKey)}`, detail: path });
    }
  }

  const dupRows = duplicates.length
    ? await prisma.product.findMany({
        where: { isActive: true, code2: { in: duplicates.map((d) => d.code2) } },
        select: { code2: true, slug: true, name: true },
        orderBy: { code2: "asc" },
      })
    : [];

  return [
    {
      id: "no-image",
      title: "Προϊόντα χωρίς εικόνα",
      total: noImageCount,
      fix: "Εικόνες ανεβαίνουν στο HDCtool (συγχρονίζονται εδώ).",
      items: noImage.map((p) => ({ label: p.name, href: `/proion/${p.slug}`, detail: p.code2 })),
    },
    {
      id: "no-description",
      title: "Προϊόντα χωρίς ελληνική περιγραφή",
      total: noDescriptionCount,
      fix: "Περιγραφές γράφονται στο HDCtool· ο τίτλος και η meta description βγαίνουν αυτόματα.",
      items: noDescription.map((p) => ({ label: p.name, href: `/proion/${p.slug}`, detail: p.code2 })),
    },
    {
      id: "long-titles",
      title: "Τίτλοι προϊόντων πάνω από 65 χαρακτήρες",
      total: tooLong.length,
      fix: "Συντομεύστε τον τίτλο στην καρτέλα «Προϊόντα».",
      items: tooLong.map((o) => ({ label: o.seoTitle ?? "", href: `/admin/seo?tab=products&key=${encodeURIComponent(o.targetKey)}`, detail: `${(o.seoTitle ?? "").length} χαρ.` })),
    },
    {
      id: "no-intro",
      title: "Κατηγορίες χωρίς γραμμένη εισαγωγή",
      total: noIntro.length,
      fix: "Έχουν την αυτόματη· μια γραμμένη εισαγωγή απαντά καλύτερα.",
      items: noIntro.slice(0, SAMPLE).map((c) => ({ label: c.nameEl, href: `/admin/seo?tab=categories&key=${encodeURIComponent(c.slug)}`, detail: `${c.productCount} προϊόντα` })),
    },
    {
      id: "drafts-no-faq",
      title: "Πρόχειρα χωρίς FAQ",
      total: noFaq.length,
      fix: "Προσθέστε ερωτήσεις: γίνονται FAQPage.",
      items: noFaq.map((d) => ({ label: d.title, href: `/admin/seo?tab=articles&edit=${d.id}` })),
    },
    {
      id: "duplicate-codes",
      title: "Κωδικοί που έχουν πάνω από ένα ενεργό προϊόν",
      total: duplicates.length,
      fix: "Διορθώνονται στο SoftOne· ώσπου να διορθωθούν, η αναζήτηση κωδικού δείχνει αποτελέσματα αντί για το προϊόν.",
      items: dupRows.map((p) => ({ label: p.name, href: `/proion/${p.slug}`, detail: p.code2 })),
    },
    {
      id: "broken-links",
      title: "Σύνδεσμοι σε σελίδες που δεν υπάρχουν",
      total: brokenItems.length,
      fix: "Διορθώστε τον σύνδεσμο στο κείμενο.",
      items: brokenItems.slice(0, 60),
    },
  ];
}

// ── Magento coverage ────────────────────────────────────────────────────────

export async function magentoCoverage(): Promise<{
  generatedAt: string;
  products: { covered: number; total: number };
  uncovered: AuditItem[];
  ambiguous: string[];
}> {
  const table = (await import("@/config/magento-redirects.json")).default as unknown as {
    generatedAt: string;
    products: Record<string, string>;
    ambiguous: { codes?: string[] };
  };
  const targets = new Set(Object.values(table.products));
  const products = await prisma.product.findMany({ where: { isActive: true }, select: { slug: true, name: true, code2: true } });
  const uncovered = products.filter((p) => !targets.has(p.slug));
  return {
    generatedAt: table.generatedAt,
    products: { covered: products.length - uncovered.length, total: products.length },
    uncovered: uncovered.slice(0, 40).map((p) => ({ label: p.name, href: `/proion/${p.slug}`, detail: p.code2 })),
    ambiguous: table.ambiguous?.codes ?? [],
  };
}
