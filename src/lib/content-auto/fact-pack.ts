import "server-only";
import { prisma } from "@/lib/prisma";
import type { ContentTopicKind } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { displayName } from "@/lib/milwaukee/display";
import { parseModel } from "@/lib/milwaukee/model";
import { modelPath } from "@/lib/milwaukee/model-slug";
import { kitFromTechBlock, parseTechBlock, type TechRow } from "@/lib/milwaukee/tech-block";
import { accentedName } from "@/lib/seo/category-seo";
import { hubForPlatform } from "@/lib/seo/hubs";
import { allowedImage } from "@/lib/seo/markdown";
import { internalLinks } from "@/lib/seo/seo-checks";
import { supportedNumbers } from "@/lib/content-auto/text";
import type { TopicPayload } from "@/lib/content-auto/planner";

/**
 * The fact pack: the ONLY source the writer may use (spec §4).
 *
 *   products   name, model, code, platform, kit contents, the catalogue's
 *              «Τεχνικά χαρακτηριστικά» and its description, and Milwaukee's
 *              official specs through HDCtool when it has them
 *   links      real internal paths: product, model, category, hub, and
 *              published articles on the same subject
 *   store      Piraeus, pick-up and delivery — nothing with a time or amount
 *
 * Never in it: prices, stock, quantities, counts. The product query does not
 * even select them, so no later edit can leak one into a prompt.
 */

export type OfficialSpec = { name: string; value: string; unit: string | null };

export type PackProduct = {
  code: string;
  name: string;
  /** «M18 FPD3-502X» */
  model: string | null;
  root: string | null;
  platform: string | null;
  fuel: boolean;
  oneKey: boolean;
  content: string | null;
  kit: string | null;
  url: string;
  description: string | null;
  specs: TechRow[];
  official: OfficialSpec[];
  officialUrl: string | null;
  /** The catalogue photo — for the images, never sent to the writer. */
  image: string | null;
};

export type PackLink = { href: string; anchor: string };

export type FactPack = {
  topic: { kind: ContentTopicKind; title: string; keyword: string; keywords: string[]; categoryName: string | null };
  articleKind: "ARTICLE" | "GUIDE";
  products: PackProduct[];
  links: PackLink[];
  store: string[];
  /** The official pages the specs came from: the article's `sources`. */
  sources: string[];
  /** The product whose photo becomes the hero, when there is one. */
  representative: string | null;
  notes: string[];
};

export const STORE_FACTS = [
  "Το Milwaukee Heavy Duty Centre είναι κατάστημα εργαλείων Milwaukee στον Πειραιά.",
  "Πουλά εργαλεία μπαταρίας M12, M18 και MX FUEL, αξεσουάρ, εργαλεία χειρός και PACKOUT.",
  "Παραλαβή από το κατάστημα στον Πειραιά ή αποστολή σε όλη την Ελλάδα.",
];

export type RawProduct = {
  code2: string;
  name: string;
  slug: string;
  modelRoot: string | null;
  modelContent: string | null;
  platform: string | null;
  isFuel: boolean;
  isOneKey: boolean;
  image: string | null;
  longDescriptionEl: string | null;
};

/** The prose before «Τεχνικά χαρακτηριστικά:», without any sentence about money or stock. */
export function describeProduct(longDescription: string | null): string | null {
  if (!longDescription) return null;
  const at = longDescription.search(/(Τεχνικά χαρακτηριστικά|Technical specifications)\s*:/i);
  const prose = (at === -1 ? longDescription : longDescription.slice(0, at)).trim();
  const clean = prose
    .split(/(?<=[.!;])\s+/)
    .filter((s) => !/€|ευρώ|τιμ[ήέ]|απόθεμ|διαθέσιμ|τεμάχι|προσφορ|έκπτωσ/i.test(s))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? clean.slice(0, 1400) : null;
}

// ── What a bare tool does not come with ────────────────────────────────────
//
// The catalogue is not always right about a bare tool: the M18 FMTIW2F12-0X
// lists «Σετ περιλαμβάνονται: 2 x M18 B5, M12-18 FC, HD Box». A bare tool
// (content «bare», or a model ending -0, -0X, -0C) keeps none of that — no
// battery or charger row, spec or sentence — so neither the writer nor the
// numbers gate can lean on it.

/** A row about what is in the box: batteries, charger, kit contents. «Παραδίδεται σε: HD Box» stays (the X of -0X). */
export const BOX_LABEL =
  /(σετ\s+περιλαμβ|περιλαμβάνετ|παρεχόμεν|μπαταρ|φορτιστ|\bkit\b|\bset\b|battery|batteries|charger|included|supplied)/i;
/** A value naming batteries or a charger: «2 x M18 B5», «M12-18 FC», «5.0 Ah», «φορτιστής». */
export const BOX_VALUE =
  /(\d\s*[x×]\s*(M1[28]|μπαταρ|batter)|\bM1[28]\s*(B|HB|HNRG|NRG|FB)\s?\d|\bM12-18\s*[A-Z]*|\bC12\s*C\b|\d\s*Ah\b|μπαταρ|φορτιστ|batter|charger)/i;
/** Weights are measured WITH a battery: kept, without naming it. */
const WEIGHT_LABEL = /βάρος|weight/i;

/** «-0», «-0X», «-0C»: a bare tool, whatever the catalogue says. */
export const isBareModel = (model: string | null | undefined) => !!model && /-0[XC]?$/i.test(model.trim());

export function withoutBoxRows<T extends { label: string; value: string }>(rows: T[]): T[] {
  return rows
    .map((r) => (WEIGHT_LABEL.test(r.label) ? { ...r, value: r.value.replace(/\(?\s*\bM1[28]\s*[A-Z]*\s?\d+(?:[.,]\d)?\s*\)?/gi, "").trim() } : r))
    .filter((r) => r.value && (WEIGHT_LABEL.test(r.label) || (!BOX_LABEL.test(r.label) && !BOX_VALUE.test(r.value))));
}

/** A bare tool's description: no sentence about batteries or a charger, unless it says «χωρίς». */
export function withoutBoxSentences(text: string | null): string | null {
  if (!text) return text;
  const kept = text
    .split(/(?<=[.!;])\s+/)
    .filter((s) => /χωρίς|without/i.test(s) || !BOX_VALUE.test(s))
    .join(" ")
    .trim();
  return kept || null;
}

export function packProduct(raw: RawProduct, official: { specs: OfficialSpec[]; url: string | null } | null): PackProduct {
  const parsed = parseModel(raw.name);
  const allSpecs = parseTechBlock(raw.longDescriptionEl);
  const declared = (raw.modelContent ?? parsed?.content) === "bare" ? "bare" : (raw.modelContent ?? parsed?.content) === "kit" ? "kit" : null;
  const content = isBareModel(parsed?.code) ? "bare" : declared;
  const bare = content === "bare";
  const specs = bare ? withoutBoxRows(allSpecs) : allSpecs;
  const officialSpecs = official?.specs ?? [];
  const kit = content === "kit" ? (kitFromTechBlock(specs) ?? parsed?.kit ?? null) : null;
  return {
    code: raw.code2,
    name: displayName(raw.name, raw.code2),
    model: parsed?.code ?? null,
    root: raw.modelRoot ?? parsed?.root ?? null,
    platform: raw.platform === "MX" ? "MX FUEL" : raw.platform,
    fuel: raw.isFuel || parsed?.fuel === true,
    oneKey: raw.isOneKey || parsed?.oneKey === true,
    content: content === "bare" ? "σκέτο εργαλείο, χωρίς μπαταρίες και φορτιστή" : content === "kit" ? "κιτ" : null,
    kit: kit ? `${kit.batteries} ${kit.batteries === 1 ? "μπαταρία" : "μπαταρίες"} ${kit.ah.toFixed(1).replace(".", ",")} Ah` : null,
    url: `/proion/${raw.slug}`,
    description: bare ? withoutBoxSentences(describeProduct(raw.longDescriptionEl)) : describeProduct(raw.longDescriptionEl),
    specs: specs.filter((r) => !/^Κωδικός$/i.test(r.label)),
    official: bare
      ? withoutBoxRows(officialSpecs.map((o) => ({ ...o, label: o.name }))).map(({ name, value, unit }) => ({ name, value, unit }))
      : officialSpecs,
    officialUrl: official?.url ?? null,
    image: raw.image,
  };
}

/** The product whose photo leads: the bare tool for a model, else the first, always one with a photo. */
export function pickRepresentative(products: PackProduct[], kind: ContentTopicKind, hosts?: Set<string>): string | null {
  const withImage = products.filter((p) => p.image && allowedImage(p.image, hosts));
  const bare = kind === "MODEL" || kind === "NEW_PRODUCT" ? withImage.find((p) => p.content?.startsWith("σκέτο")) : undefined;
  return (bare ?? withImage[0])?.code ?? null;
}

/** What the writer sees: the pack without photos and bookkeeping. */
export function promptPack(pack: FactPack) {
  return {
    θέμα: pack.topic,
    είδος: pack.articleKind === "GUIDE" ? "οδηγός αγοράς" : "άρθρο",
    προϊόντα: pack.products.map((p) => ({
      κωδικός: p.code,
      όνομα: p.name,
      μοντέλο: p.model,
      πλατφόρμα: p.platform,
      FUEL: p.fuel,
      "ONE-KEY": p.oneKey,
      περιεχόμενο: p.content,
      κιτ: p.kit,
      σελίδα: p.url,
      περιγραφή: p.description,
      τεχνικά: p.specs,
      "επίσημα στοιχεία Milwaukee": p.official,
    })),
    σύνδεσμοι: pack.links,
    κατάστημα: pack.store,
  };
}

/** The «unit:value» pairs the pack states (the numbers gate). */
export function packNumbers(pack: FactPack): Set<string> {
  const texts = [
    ...pack.store,
    ...pack.products.flatMap((p) => [p.name, p.model ?? "", p.kit ?? "", p.description ?? ""]),
  ];
  const rows = pack.products.flatMap((p) => [...p.specs, ...p.official.map((o) => ({ label: o.name, value: o.value, unit: o.unit }))]);
  return supportedNumbers(texts, rows);
}

// ── Loading ─────────────────────────────────────────────────────────────────

const MAX_PRODUCTS = 8;
const MAX_OFFICIAL = 4;
const FIELD = { CATEGORY: "mtrcategory", GROUP: "mtrgroup", SUBGROUP: "cccSubgroup2" } as const;
const OFFICIAL_ACTOR = "auto-content@milwaukeetoolshdc.gr";

const productSelect = {
  code2: true,
  name: true,
  slug: true,
  modelRoot: true,
  modelContent: true,
  platform: true,
  isFuel: true,
  isOneKey: true,
  mtrgroup: true,
  cccSubgroup2: true,
  images: { orderBy: [{ isFeature: "desc" as const }, { order: "asc" as const }], take: 1, select: { url: true } },
  translations: { where: { locale: "el" as const }, select: { longDescription: true, shortDescription: true } },
} satisfies Prisma.ProductSelect;

type Row = {
  code2: string;
  name: string;
  slug: string;
  modelRoot: string | null;
  modelContent: string | null;
  platform: string | null;
  isFuel: boolean;
  isOneKey: boolean;
  mtrgroup: number | null;
  cccSubgroup2: number | null;
  images: Array<{ url: string }>;
  translations: Array<{ longDescription: string | null; shortDescription: string | null }>;
};

const toRaw = (r: Row): RawProduct => ({
  code2: r.code2,
  name: r.name,
  slug: r.slug,
  modelRoot: r.modelRoot,
  modelContent: r.modelContent,
  platform: r.platform,
  isFuel: r.isFuel,
  isOneKey: r.isOneKey,
  image: r.images[0]?.url ?? null,
  longDescriptionEl: r.translations[0]?.longDescription ?? null,
});

async function modelRows(root: string): Promise<Row[]> {
  const token = root.split(" ")[1] ?? root;
  const rows = await prisma.product.findMany({
    where: { isActive: true, code2: { not: "" }, OR: [{ modelRoot: root }, { modelRoot: null, name: { contains: token, mode: "insensitive" } }] },
    orderBy: { mtrl: "asc" },
    take: 40,
    select: productSelect,
  });
  return rows
    .filter((r) => (r.modelRoot ?? parseModel(r.name)?.root) === root)
    .sort((a, b) => Number((a.modelContent ?? parseModel(a.name)?.content) !== "bare") - Number((b.modelContent ?? parseModel(b.name)?.content) !== "bare"))
    .slice(0, MAX_PRODUCTS);
}

/** A category's products, one per model family, the ones with specs and a photo first. */
async function categoryRows(slugs: string[]): Promise<{ rows: Row[]; categories: Array<{ slug: string; nameEl: string }> }> {
  const categories = await prisma.category.findMany({
    where: { slug: { in: slugs }, productCount: { gt: 0 } },
    select: { slug: true, nameEl: true, erpType: true, erpCode: true },
  });
  categories.sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug));
  const rows: Row[] = [];
  for (const c of categories) {
    const code = Number(c.erpCode);
    if (!Number.isFinite(code)) continue;
    const found = await prisma.product.findMany({
      where: { isActive: true, isVariantLead: true, code2: { not: "" }, [FIELD[c.erpType]]: code } as Prisma.ProductWhereInput,
      // Stock orders the choice and is never selected: the pack must not carry it.
      orderBy: [{ isFuel: "desc" }, { inStock: "desc" }, { mtrl: "desc" }],
      take: 60,
      select: productSelect,
    });
    rows.push(...found);
  }
  const score = (r: Row) =>
    (parseTechBlock(r.translations[0]?.longDescription).length > 0 ? 2 : 0) + (r.images.length ? 1 : 0);
  const seen = new Set<string>();
  const picked: Row[] = [];
  for (const r of [...rows].sort((a, b) => score(b) - score(a))) {
    const family = r.modelRoot ?? parseModel(r.name)?.root ?? r.code2;
    if (seen.has(family)) continue;
    seen.add(family);
    picked.push(r);
    if (picked.length >= MAX_PRODUCTS) break;
  }
  return { rows: picked, categories };
}

type OfficialFetch = (code: string) => Promise<{ specs: OfficialSpec[]; url: string | null } | null>;

/** Milwaukee's page for a code through HDCtool; null when HDCtool has none or does not answer. */
const hdctoolOfficial: OfficialFetch = async (code) => {
  const { getOfficialByCode } = await import("@/lib/hdctool/milwaukee-admin");
  const result = await getOfficialByCode(OFFICIAL_ACTOR, code);
  if (!result.ok || !result.official.product) return null;
  const p = result.official.product;
  return { specs: p.specsEn.map((s) => ({ name: s.name, value: s.value, unit: s.unit })), url: p.url || null };
};

export type LoadOptions = { official?: OfficialFetch };

export type TopicForPack = { kind: ContentTopicKind; title: string; payload: TopicPayload };

export async function loadFactPack(topic: TopicForPack, options: LoadOptions = {}): Promise<FactPack> {
  const payload = topic.payload;
  const notes: string[] = [];
  let rows: Row[] = [];
  let categories: Array<{ slug: string; nameEl: string }> = [];

  if ((topic.kind === "MODEL" || topic.kind === "NEW_PRODUCT") && payload.root) {
    rows = await modelRows(payload.root);
  } else {
    const slugs = payload.categorySlug ? [payload.categorySlug] : (payload.categorySlugs ?? []);
    ({ rows, categories } = await categoryRows(slugs));
  }

  // Official specs, a few products, in parallel; HDCtool may be down or keyless.
  const fetchOfficial = options.official ?? hdctoolOfficial;
  const officialFor = new Map<string, { specs: OfficialSpec[]; url: string | null } | null>();
  const wanted = rows.slice(0, MAX_OFFICIAL).map((r) => r.code2);
  const results = await Promise.allSettled(wanted.map((code) => fetchOfficial(code)));
  results.forEach((r, i) => officialFor.set(wanted[i], r.status === "fulfilled" ? r.value : null));
  const missing = wanted.filter((code) => !officialFor.get(code));
  if (missing.length) notes.push(`Χωρίς επίσημα στοιχεία Milwaukee για ${missing.join(", ")}.`);

  const products = rows.map((r) => packProduct(toRaw(r), officialFor.get(r.code2) ?? null));

  // The category name with its accents back, from its products' own descriptions.
  const categoryName = categories[0]
    ? accentedName(categories[0].nameEl, rows.map((r) => r.translations[0]?.shortDescription ?? null)).toLowerCase()
    : null;

  const links = await packLinks(products, rows, categories);
  const kind = payload.articleKind;
  const pack: FactPack = {
    topic: {
      kind: topic.kind,
      title: topic.title,
      keyword: payload.keyword,
      keywords: payload.keywords ?? [payload.keyword],
      categoryName,
    },
    articleKind: kind,
    products,
    links,
    store: STORE_FACTS,
    sources: [...new Set(products.map((p) => p.officialUrl).filter((u): u is string => !!u))],
    representative: null,
    notes,
  };
  pack.representative = pickRepresentative(products, topic.kind);
  return pack;
}

/** Real internal paths only: every one of them exists now. */
async function packLinks(products: PackProduct[], rows: Row[], topicCategories: Array<{ slug: string; nameEl: string }>): Promise<PackLink[]> {
  const links: PackLink[] = [];
  const add = (href: string, anchor: string) => {
    if (!links.some((l) => l.href === href)) links.push({ href, anchor });
  };
  // ERP names are capitals without accents: the products' own words give them back.
  const texts = rows.map((r) => r.translations[0]?.shortDescription ?? null);
  const categoryAnchor = (nameEl: string) => accentedName(nameEl, texts).toLowerCase();
  for (const c of topicCategories) add(`/katalogos/${c.slug}`, categoryAnchor(c.nameEl));
  for (const p of products) add(p.url, p.model ?? p.name);
  const roots = [...new Set(products.map((p) => p.root).filter((r): r is string => !!r))];
  for (const root of roots.slice(0, 6)) add(modelPath(root), `Milwaukee ${root}`);

  const groups = [...new Set(rows.map((r) => r.mtrgroup).filter((g): g is number => g != null))].map(String);
  const subgroups = [...new Set(rows.map((r) => r.cccSubgroup2).filter((g): g is number => g != null))].map(String);
  const cats = await prisma.category.findMany({
    where: {
      productCount: { gt: 0 },
      OR: [
        { erpType: "GROUP", erpCode: { in: groups } },
        { erpType: "SUBGROUP", erpCode: { in: subgroups } },
      ],
    },
    select: { slug: true, nameEl: true },
    take: 8,
  });
  for (const c of cats) add(`/katalogos/${c.slug}`, categoryAnchor(c.nameEl));

  const platforms = [...new Set(products.map((p) => (p.platform === "MX FUEL" ? "MX" : p.platform)))];
  for (const platform of platforms) {
    if (platform === "M12" || platform === "M18" || platform === "MX") {
      const hub = hubForPlatform(platform);
      add(hub.path, hub.label);
    }
  }

  // Published articles and guides on the same categories or products.
  const paths = new Set(links.map((l) => l.href));
  const published = await prisma.contentArticle.findMany({
    where: { status: "PUBLISHED", publishedAt: { not: null } },
    select: { kind: true, slug: true, title: true, body: true },
  });
  const related = published
    .map((a) => ({ a, overlap: internalLinks(a.body).filter((l) => paths.has(l)).length }))
    .filter((x) => x.overlap > 0)
    .sort((x, y) => y.overlap - x.overlap)
    .slice(0, 5);
  for (const { a } of related) add(`${a.kind === "GUIDE" ? "/odigoi" : "/blog"}/${a.slug}`, a.title);
  return links;
}
