/**
 * Import the drafted content in docs/content/** into the database, as drafts.
 *
 *   npx tsx --env-file=.env scripts/content/import-content.ts [--dry-run] [--publish]
 *
 *   docs/content/news/<nn>-<slug>/el.md        → ContentArticle ARTICLE (DRAFT)
 *   docs/content/guides/<nn>-<slug>/el.md      → ContentArticle GUIDE   (DRAFT)
 *   docs/content/seo/platforms/<key>/el.md     → SeoOverride PLATFORM
 *   docs/content/seo/categories/<slug>.json    → SeoOverride CATEGORY (its `el` block)
 *
 * Greek only (en.md / it.md are never read). Idempotent: upsert by slug or
 * by target, and a row whose content is unchanged is not written at all.
 * A row that somebody has edited in the admin — `updatedBy` is no longer the
 * importer — is left alone and reported, so re-running the import after
 * writers add files never undoes an editor's work.
 *
 * Status: a new article is a DRAFT and re-importing never changes it —
 * unless `--publish` is given, which publishes every ARTICLE and GUIDE the
 * importer owns (keeping an existing publishedAt). Rows edited in the admin
 * are still left alone.
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { DEALER_WORDING } from "@/lib/seo/llms";
import {
  parseArticleFile,
  parseCategoryFile,
  parsePlatformFile,
  type ArticleDraft,
  type OverrideDraft,
} from "@/lib/seo/content-files";

export const IMPORT_ACTOR = "import:docs/content";

const ROOT = path.resolve(__dirname, "../../docs/content");
const dryRun = process.argv.includes("--dry-run");
const publish = process.argv.includes("--publish");

type Tally = {
  created: number;
  updated: number;
  unchanged: number;
  published: number;
  skipped: string[];
  warnings: string[];
};
const tally: Tally = { created: 0, updated: 0, unchanged: 0, published: 0, skipped: [], warnings: [] };

function greekFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(abs, d.name, "el.md"))
    .filter((f) => fs.existsSync(f))
    .sort();
}

function checkWording(label: string, ...texts: Array<string | null | undefined>) {
  if (texts.some((t) => t && DEALER_WORDING.test(t))) {
    tally.warnings.push(`${label}: dealer/representative wording — fix before publishing`);
  }
}

/** Stable JSON: Postgres `jsonb` reorders object keys, so compare sorted. */
const json = (v: unknown): string =>
  JSON.stringify(v ?? null, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );

async function importArticle(file: string, draft: ArticleDraft) {
  const label = `${draft.kind} ${draft.slug} (${path.relative(ROOT, file)})`;
  checkWording(label, draft.title, draft.seoTitle, draft.metaDescription, draft.answer, draft.body, json(draft.faq));

  const data = {
    kind: draft.kind,
    title: draft.title,
    seoTitle: draft.seoTitle,
    metaDescription: draft.metaDescription,
    answer: draft.answer,
    body: draft.body,
    faq: draft.faq,
    keywords: draft.keywords,
    entities: draft.entities,
    sources: draft.sources,
    heroImageUrl: draft.heroImageUrl,
    heroImageAlt: draft.heroImageAlt,
  };
  const now = new Date();

  const existing = await prisma.contentArticle.findUnique({ where: { slug: draft.slug } });
  if (!existing) {
    if (!dryRun) {
      await prisma.contentArticle.create({
        data: {
          ...data,
          slug: draft.slug,
          status: publish ? "PUBLISHED" : "DRAFT",
          publishedAt: publish ? now : null,
          updatedBy: IMPORT_ACTOR,
        },
      });
    }
    tally.created++;
    if (publish) tally.published++;
    return;
  }
  if (existing.updatedBy !== IMPORT_ACTOR) {
    tally.skipped.push(`${label}: edited in the admin by ${existing.updatedBy}`);
    return;
  }
  if (existing.kind !== draft.kind) {
    tally.skipped.push(`${label}: slug already used by a ${existing.kind}`);
    return;
  }
  const same =
    existing.title === data.title &&
    existing.seoTitle === data.seoTitle &&
    existing.metaDescription === data.metaDescription &&
    existing.answer === data.answer &&
    existing.body === data.body &&
    existing.heroImageUrl === data.heroImageUrl &&
    existing.heroImageAlt === data.heroImageAlt &&
    json(existing.faq) === json(data.faq) &&
    json(existing.keywords) === json(data.keywords) &&
    json(existing.entities) === json(data.entities) &&
    json(existing.sources) === json(data.sources);
  const toPublish = publish && existing.status !== "PUBLISHED";
  if (same && !toPublish) {
    tally.unchanged++;
    return;
  }
  if (!dryRun) {
    await prisma.contentArticle.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...(toPublish ? { status: "PUBLISHED" as const, publishedAt: existing.publishedAt ?? now } : {}),
      },
    });
  }
  if (!same) tally.updated++;
  if (toPublish) tally.published++;
}

async function importOverride(file: string, draft: OverrideDraft) {
  const label = `${draft.targetType} ${draft.targetKey} (${path.relative(ROOT, file)})`;
  checkWording(label, draft.h1, draft.seoTitle, draft.metaDescription, draft.intro, draft.body, json(draft.faq));

  const orNull = (list: Prisma.InputJsonValue[]) => (list.length ? list : Prisma.DbNull);
  const data = {
    h1: draft.h1,
    seoTitle: draft.seoTitle,
    metaDescription: draft.metaDescription,
    intro: draft.intro,
    body: draft.body,
    faq: orNull(draft.faq),
    keywords: orNull(draft.keywords),
    entities: orNull(draft.entities),
    sources: orNull(draft.sources),
    relatedArticles: orNull(draft.relatedArticles),
    relatedCategories: orNull(draft.relatedCategories),
  };
  const where = { targetType_targetKey: { targetType: draft.targetType, targetKey: draft.targetKey } };

  const existing = await prisma.seoOverride.findUnique({ where });
  if (!existing) {
    if (!dryRun) {
      await prisma.seoOverride.create({
        data: { ...data, targetType: draft.targetType, targetKey: draft.targetKey, updatedBy: IMPORT_ACTOR },
      });
    }
    tally.created++;
    return;
  }
  if (existing.updatedBy !== IMPORT_ACTOR) {
    tally.skipped.push(`${label}: edited in the admin by ${existing.updatedBy}`);
    return;
  }
  const list = (v: unknown[]) => json(v.length ? v : null);
  const same =
    existing.h1 === data.h1 &&
    existing.seoTitle === data.seoTitle &&
    existing.metaDescription === data.metaDescription &&
    existing.intro === data.intro &&
    existing.body === data.body &&
    json(existing.faq) === list(draft.faq) &&
    json(existing.keywords) === list(draft.keywords) &&
    json(existing.entities) === list(draft.entities) &&
    json(existing.sources) === list(draft.sources) &&
    json(existing.relatedArticles) === list(draft.relatedArticles) &&
    json(existing.relatedCategories) === list(draft.relatedCategories);
  if (same) {
    tally.unchanged++;
    return;
  }
  if (!dryRun) await prisma.seoOverride.update({ where, data });
  tally.updated++;
}

async function main() {
  const read = (f: string) => fs.readFileSync(f, "utf8");

  for (const [dir, kind] of [
    ["news", "ARTICLE"],
    ["guides", "GUIDE"],
  ] as const) {
    for (const file of greekFiles(dir)) {
      const draft = parseArticleFile(read(file), kind);
      if (!draft) tally.skipped.push(`${path.relative(ROOT, file)}: no Greek slug/title`);
      else await importArticle(file, draft);
    }
  }

  for (const file of greekFiles("seo/platforms")) {
    const draft = parsePlatformFile(read(file));
    if (!draft) tally.skipped.push(`${path.relative(ROOT, file)}: no key`);
    else await importOverride(file, draft);
  }

  const catDir = path.join(ROOT, "seo/categories");
  if (fs.existsSync(catDir)) {
    for (const name of fs.readdirSync(catDir).filter((n) => n.endsWith(".json")).sort()) {
      const file = path.join(catDir, name);
      const draft = parseCategoryFile(read(file));
      if (!draft) tally.skipped.push(`seo/categories/${name}: no slug or Greek block`);
      else await importOverride(file, draft);
    }
  }

  console.log(
    `${dryRun ? "[dry run] " : ""}created ${tally.created}, updated ${tally.updated}, unchanged ${tally.unchanged}, ` +
      `published ${tally.published}, skipped ${tally.skipped.length}`,
  );
  for (const s of tally.skipped) console.log(`  skipped  ${s}`);
  for (const w of tally.warnings) console.log(`  WARNING  ${w}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
