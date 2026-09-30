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
 *
 * `--only=<list>` limits the run to some entries, comma-separated: a term by
 * its file name or slug (`cookie-policy`, `personal-data-protection-policy`),
 * or `faq` for the FAQ. Without it, everything. For example, only the cookie
 * and privacy policies, as a dry run:
 *
 *   npx tsx --env-file=.env /Volumes/EXTERNALSSD/hdc-front/scripts/hdctool/apply-hdc-content.ts \
 *     --only=cookie-policy,personal-data-protection-policy --dry-run
 *
 * `--dry-run` is the default and only says so explicitly; it refuses to run
 * together with `--apply`. The dry run lists, per term and language, the
 * paragraphs that would be removed (-) and added (+) — which is also how an
 * edit made in the admin since the last run shows up before it is overwritten.
 */
import fs from "node:fs";
import path from "node:path";

const CONTENT_DIR = path.resolve(__dirname, "../../docs/content/hdc-terms-faq");
const APPLY = process.argv.includes("--apply");
const DRY_RUN = process.argv.includes("--dry-run");
const ONLY = (() => {
  const arg = process.argv.find((a) => a.startsWith("--only="));
  if (!arg) return null;
  const names = arg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean);
  if (!names.length) throw new Error("--only= needs at least one name");
  return new Set(names);
})();

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

/**
 * The block-level pieces of an HTML text (paragraphs, headings, list items,
 * table rows), as plain text: what the dry run compares.
 */
function blocks(html: unknown): string[] {
  return String(html ?? "")
    .replace(/\r/g, "")
    .split(/<\/(?:p|h[1-6]|li|tr)>|<br\s*\/?>/i)
    .map((b) => b.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Paragraphs only in the current row (-) and only in the new text (+). */
function blockDiff(current: unknown, next: string): { removed: string[]; added: string[] } {
  const now = blocks(current);
  const then = blocks(next);
  return {
    removed: now.filter((b) => !then.includes(b)),
    added: then.filter((b) => !now.includes(b)),
  };
}

function brief(html: unknown): string {
  const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

async function main() {
  // HDCtool's own client, resolved from the HDCtool checkout this runs in.
  const { prisma } = await import(path.join(process.cwd(), "src/lib/prisma"));

  if (APPLY && DRY_RUN) throw new Error("--apply and --dry-run together: pick one.");
  const allTerms = readJson<TermEntry[]>("terms/manifest.json");
  const allFaq = readJson<FaqEntry[]>("faq.json");
  if (ONLY) {
    const known = new Set(["faq", ...allTerms.flatMap((t) => [t.file, t.slug])]);
    const unknown = [...ONLY].filter((n) => !known.has(n));
    if (unknown.length) throw new Error(`--only: unknown ${unknown.join(", ")} (known: ${[...known].join(", ")})`);
  }
  const terms = ONLY ? allTerms.filter((t) => ONLY.has(t.file) || ONLY.has(t.slug)) : allTerms;
  const faq = !ONLY || ONLY.has("faq") ? allFaq : [];

  const termRows: Row[] = await prisma.eshopTerms.findMany({ where: { slug: { in: terms.map((t) => t.slug) } } });
  const faqRows: Row[] = await prisma.eshopQandA.findMany({ where: { slug: { in: faq.map((f) => f.slug) } } });
  const termRow = (slug: string) => termRows.find((r) => r.slug === slug);
  const faqRow = (slug: string) => faqRows.find((r) => r.slug === slug);

  const missing = [
    ...terms.filter((t) => !termRow(t.slug)),
    ...faq.filter((f) => f.action === "update" && !faqRow(f.slug)),
  ].map((x) => x.slug);
  if (missing.length) throw new Error(`Rows not found in HDCtool: ${missing.join(", ")} — nothing written.`);

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — HDCtool database from ${process.cwd()}`);
  if (ONLY) console.log(`only: ${[...ONLY].join(", ")}`);
  console.log("\nTERMS (EshopTerms, hdc=true)");
  const LANG_FIELD = { el: "Greek", en: "English", it: "Italian" } as const;
  for (const t of terms) {
    const row = termRow(t.slug)!;
    console.log(`  ${t.slug}: "${row.titleGreek}" → "${t.title.el}"`);
    console.log(`     now: ${brief(row.contentGreek)}`);
    console.log(`     new: ${brief(termHtml(t.file, "el"))}`);
    for (const lang of ["el", "en", "it"] as const) {
      const field = LANG_FIELD[lang];
      const title = row[`title${field}`] === t.title[lang] ? "" : ` title "${row[`title${field}`]}" → "${t.title[lang]}"`;
      const { removed, added } = blockDiff(row[`content${field}`], termHtml(t.file, lang));
      if (!title && !removed.length && !added.length) {
        console.log(`     [${lang}] unchanged`);
        continue;
      }
      console.log(`     [${lang}]${title}${removed.length || added.length ? "" : " (content unchanged)"}`);
      for (const b of removed) console.log(`        - ${b}`);
      for (const b of added) console.log(`        + ${b}`);
    }
  }
  if (faq.length) {
    console.log("\nFAQ (EshopQandA)");
    for (const f of faq) {
      const row = faqRow(f.slug);
      console.log(`  #${f.order} ${row ? `update (${row.availableFor} → HDC)` : "create (HDC)"}: ${f.q.el}`);
    }
  } else {
    console.log("\nFAQ: skipped (--only)");
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
