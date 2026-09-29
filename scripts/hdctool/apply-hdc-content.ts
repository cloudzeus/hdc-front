/**
 * Loads the reviewed HDC terms and FAQ (docs/content/hdc-terms-faq) into
 * HDCtool's EshopTerms / EshopQandA — the rows staff edit in the HDCtool admin
 * and hdc-front reads through GET /api/public/eshop-content?site=hdc.
 *
 * It runs against HDCtool's database with HDCtool's Prisma client, so it is
 * started from the HDCtool checkout:
 *
 *   cd /Volumes/EXTERNALSSD/hdckolleris/hdckolleris
 *   npx tsx --env-file=.env /Volumes/EXTERNALSSD/hdc-front/scripts/hdctool/apply-hdc-content.ts
 *   npx tsx --env-file=.env /Volumes/EXTERNALSSD/hdc-front/scripts/hdctool/apply-hdc-content.ts --apply
 *
 * Without --apply it only prints what would change. With --apply it first
 * writes a JSON backup of every row it touches, then applies everything in one
 * transaction:
 *   - the four terms rows (hdc=true) get new titles and content, by slug;
 *   - FAQ rows marked "update" are rewritten and moved to availableFor=HDC
 *     (they are BOTH today, but nothing on the Kolleris eshop reads them);
 *   - FAQ rows marked "create" are inserted as availableFor=HDC, or updated if
 *     that slug already exists, so a second run changes nothing.
 * Slugs are left as they are: the old milwaukeetoolshdc.gr site may link them.
 */
import fs from "node:fs";
import path from "node:path";

const CONTENT_DIR = path.resolve(__dirname, "../../docs/content/hdc-terms-faq");
const APPLY = process.argv.includes("--apply");

type Lang = "el" | "en" | "it";
type Text = Record<Lang, string>;
type TermEntry = { slug: string; file: string; title: Text };
type FaqEntry = { slug: string; action: "update" | "create"; order: number; q: Text; a: Text };
type Row = { slug: string; [key: string]: unknown };

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, file), "utf8")) as T;
}

function termHtml(file: string, lang: Lang): string {
  return fs.readFileSync(path.join(CONTENT_DIR, "terms", `${file}.${lang}.html`), "utf8").trim();
}

function brief(html: unknown): string {
  const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

async function main() {
  // HDCtool's own client, resolved from the HDCtool checkout this runs in.
  const { prisma } = await import(path.join(process.cwd(), "src/lib/prisma"));

  const terms = readJson<TermEntry[]>("terms/manifest.json");
  const faq = readJson<FaqEntry[]>("faq.json");

  const termRows: Row[] = await prisma.eshopTerms.findMany({ where: { slug: { in: terms.map((t) => t.slug) } } });
  const faqRows: Row[] = await prisma.eshopQandA.findMany({ where: { slug: { in: faq.map((f) => f.slug) } } });
  const termRow = (slug: string) => termRows.find((r) => r.slug === slug);
  const faqRow = (slug: string) => faqRows.find((r) => r.slug === slug);

  const missing = [
    ...terms.filter((t) => !termRow(t.slug)),
    ...faq.filter((f) => f.action === "update" && !faqRow(f.slug)),
  ].map((x) => x.slug);
  if (missing.length) throw new Error(`Rows not found in HDCtool: ${missing.join(", ")} — nothing written.`);

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — HDCtool database from ${process.cwd()}\n`);
  console.log("TERMS (EshopTerms, hdc=true)");
  for (const t of terms) {
    const row = termRow(t.slug)!;
    console.log(`  ${t.slug}: "${row.titleGreek}" → "${t.title.el}"`);
    console.log(`     now: ${brief(row.contentGreek)}`);
    console.log(`     new: ${brief(termHtml(t.file, "el"))}`);
  }
  console.log("\nFAQ (EshopQandA)");
  for (const f of faq) {
    const row = faqRow(f.slug);
    console.log(`  #${f.order} ${row ? `update (${row.availableFor} → HDC)` : "create (HDC)"}: ${f.q.el}`);
  }

  if (!APPLY) {
    console.log("\nNothing written. Re-run with --apply to write.");
    return;
  }

  const backupFile = path.join(CONTENT_DIR, `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ terms: termRows, faq: faqRows }, null, 1));
  console.log(`\nBackup of the current rows: ${backupFile}`);

  await prisma.$transaction(async (tx: typeof prisma) => {
    for (const t of terms) {
      await tx.eshopTerms.update({
        where: { slug: t.slug },
        data: {
          titleGreek: t.title.el,
          titleEnglish: t.title.en,
          titleItalian: t.title.it,
          contentGreek: termHtml(t.file, "el"),
          contentEnglish: termHtml(t.file, "en"),
          contentItalian: termHtml(t.file, "it"),
          hdc: true,
        },
      });
    }
    for (const f of faq) {
      const data = {
        order: f.order,
        questionGreek: f.q.el,
        answerGreek: f.a.el,
        questionEnglish: f.q.en,
        answerEnglish: f.a.en,
        questionItalian: f.q.it,
        answerItalian: f.a.it,
        availableFor: "HDC" as const,
      };
      if (faqRow(f.slug)) await tx.eshopQandA.update({ where: { slug: f.slug }, data });
      else await tx.eshopQandA.create({ data: { ...data, slug: f.slug } });
    }
  });
  console.log("Written. hdc-front picks the new texts up within an hour (content cache).");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
