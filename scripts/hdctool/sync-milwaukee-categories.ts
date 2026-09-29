/**
 * HDCtool's Admin → Milwaukee Categories → "Sync", run from a terminal.
 *
 * Same steps as `src/app/api/milwaukee-categories/sync/route.ts` in HDCtool
 * (a staff-only POST): collect the categories, groups and subgroups that have
 * MTRMARK 1364 products, create the missing ones and refresh the names from the
 * soft classification tables, then delete groups and subgroups left without
 * Milwaukee products. Two differences, both on purpose:
 *
 *   - existing rows keep their `order` unless --reorder is passed (the button
 *     rewrites it to the alphabetical index, which would undo a curated order);
 *   - a good translation is never replaced by an empty, Greek or copied one:
 *     the soft tables' Italian was empty for 55 groups the tree had right
 *     ("Batterie"), and the button would have wiped them. The good value is
 *     copied back into the soft table instead, so the button stops wiping it;
 *   - without --apply nothing is written: it prints what would change.
 *
 * With --apply it first writes a JSON backup of every row it will update or
 * delete. Run from the HDCtool checkout:
 *
 *   cd /Volumes/EXTERNALSSD/hdckolleris/hdckolleris
 *   npx tsx --env-file=.env /Volumes/EXTERNALSSD/hdc-front/scripts/hdctool/sync-milwaukee-categories.ts [--apply] [--reorder]
 */
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const REORDER = process.argv.includes("--reorder");
const BACKUP_DIR = path.resolve(__dirname, "../../docs/content");

type Names = {
  NAMEGREEK: string;
  NAMEENGLISH: string;
  NAMEITALIAN: string;
  NAMEGERMAN: string;
  NAMEFRENCH: string;
};
type Row = {
  id: string;
  parentId: string | null;
  erpCode: string;
  erpType: "CATEGORY" | "GROUP" | "SUBGROUP";
  nameGreek: string;
  nameEnglish: string;
  nameItalian: string;
  nameGerman: string;
  nameFrench: string;
  order: number;
};

const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;
/** Empty, Greek, or the Greek name copied across — not a translation. */
const weak = (value: string | null | undefined, greek: string) => {
  const v = (value ?? "").trim();
  return !v || GREEK.test(v.replace(/Φ/g, "")) || (v === greek.trim() && GREEK.test(greek));
};
const SOFT_FIELD = {
  nameEnglish: "NAMEENGLISH",
  nameItalian: "NAMEITALIAN",
  nameGerman: "NAMEGERMAN",
  nameFrench: "NAMEFRENCH",
} as const;

const namesOf = (s: Names) => ({
  nameGreek: s.NAMEGREEK,
  nameEnglish: s.NAMEENGLISH,
  nameItalian: s.NAMEITALIAN,
  nameGerman: s.NAMEGERMAN,
  nameFrench: s.NAMEFRENCH,
});

async function main() {
  const { prisma } = await import(path.join(process.cwd(), "src/lib/prisma"));

  const products: Array<{ MTRCATEGORY: unknown; MTRGROUP: unknown; cccSubgoup2: unknown }> =
    await prisma.mTRL.findMany({
      where: { MTRMARK: { in: [1364] } },
      select: { MTRCATEGORY: true, MTRGROUP: true, cccSubgoup2: true },
      distinct: ["MTRCATEGORY", "MTRGROUP", "cccSubgoup2"],
    });
  const uniq = (values: unknown[]) => [...new Set(values.filter(Boolean).map(String))];
  const uniqueCategories = uniq(products.map((p) => p.MTRCATEGORY));
  const uniqueGroups = uniq(products.map((p) => p.MTRGROUP));
  const uniqueSubgroups = uniq(products.map((p) => p.cccSubgoup2));

  const categories: Array<Names & { CODE: string }> = await prisma.softCategory.findMany({
    where: { CODE: { in: uniqueCategories } },
    orderBy: { NAMEGREEK: "asc" },
  });
  const allGroups: Array<Names & { CODE: string; MTRCATEGORY: string }> = await prisma.softGroup.findMany({
    where: { CODE: { in: uniqueGroups } },
    orderBy: { NAMEGREEK: "asc" },
  });
  const categoryCodes = categories.map((c) => c.CODE);
  const groups = allGroups.filter((g) => categoryCodes.includes(g.MTRCATEGORY));
  const allSubgroups: Array<Names & { SHORT: string; MTRGROUP: string }> = await prisma.softSubgroup.findMany({
    where: { SHORT: { in: uniqueSubgroups } },
    orderBy: { NAMEGREEK: "asc" },
  });
  const groupCodes = groups.map((g) => g.CODE);
  const subgroups = allSubgroups.filter((s) => groupCodes.includes(s.MTRGROUP));

  const rows: Row[] = await prisma.milwaukeeCategory.findMany();
  const find = (type: Row["erpType"], code: string) => rows.find((r) => r.erpType === type && r.erpCode === code);

  type Plan =
    | { kind: "create"; type: Row["erpType"]; code: string; parentCode: string | null; data: ReturnType<typeof namesOf>; order: number }
    | { kind: "update"; row: Row; data: Partial<Row> };
  const plan: Plan[] = [];
  /** Good tree names copied back into the soft table the button reads. */
  const backfill: Array<{ type: Row["erpType"]; code: string; parentCode: string | null; data: Record<string, string> }> = [];

  const consider = (type: Row["erpType"], code: string, parentCode: string | null, soft: Names, order: number) => {
    const existing = find(type, code);
    const data = namesOf(soft);
    if (!existing) {
      plan.push({ kind: "create", type, code, parentCode, data, order });
      return;
    }
    const changed: Partial<Row> = {};
    const softData: Record<string, string> = {};
    for (const [k, v] of Object.entries(data) as Array<[keyof typeof data, string]>) {
      if ((existing[k] ?? "") === (v ?? "")) continue;
      if (k !== "nameGreek" && weak(v, data.nameGreek) && !weak(existing[k], existing.nameGreek)) {
        softData[SOFT_FIELD[k as keyof typeof SOFT_FIELD]] = existing[k] as string;
        continue;
      }
      changed[k] = v;
    }
    if (Object.keys(softData).length) backfill.push({ type, code, parentCode, data: softData });
    if (REORDER && existing.order !== order) changed.order = order;
    if (Object.keys(changed).length) plan.push({ kind: "update", row: existing, data: changed });
  };

  categories.forEach((c, i) => consider("CATEGORY", c.CODE, null, c, i));
  groups.forEach((g, i) => consider("GROUP", g.CODE, g.MTRCATEGORY, g, i));
  subgroups.forEach((s, i) => consider("SUBGROUP", s.SHORT, s.MTRGROUP, s, i));

  // Cleanup candidates, judged against MTRL as the button does.
  const deletions: Row[] = [];
  for (const sg of rows.filter((r) => r.erpType === "SUBGROUP")) {
    const has = await prisma.mTRL.findFirst({ where: { MTRMARK: { in: [1364] }, cccSubgoup2: parseInt(sg.erpCode) } });
    if (!has) deletions.push(sg);
  }
  for (const g of rows.filter((r) => r.erpType === "GROUP")) {
    const has = await prisma.mTRL.findFirst({ where: { MTRMARK: { in: [1364] }, MTRGROUP: parseInt(g.erpCode) } });
    if (has) continue;
    const children = rows.filter((r) => r.parentId === g.id && !deletions.includes(r));
    const willGetChildren = plan.some((p) => p.kind === "create" && p.type === "SUBGROUP" && p.parentCode === g.erpCode);
    if (children.length === 0 && !willGetChildren) deletions.push(g);
  }

  const creates = plan.filter((p): p is Extract<Plan, { kind: "create" }> => p.kind === "create");
  const updates = plan.filter((p): p is Extract<Plan, { kind: "update" }> => p.kind === "update");
  console.log(`${APPLY ? "APPLY" : "DRY RUN"}${REORDER ? " (reorder)" : ""}`);
  console.log(
    `create ${creates.length} · update ${updates.length} · delete ${deletions.length} · soft names kept from the tree ${backfill.length}`,
  );
  for (const c of creates) console.log(`  + ${c.type} ${c.code} ${c.data.nameGreek} (under ${c.parentCode ?? "-"})`);
  for (const u of updates) console.log(`  ~ ${u.row.erpType} ${u.row.erpCode} ${u.row.nameGreek}: ${Object.keys(u.data).join(", ")}`);
  for (const d of deletions) console.log(`  - ${d.erpType} ${d.erpCode} ${d.nameGreek}`);
  if (!APPLY) {
    console.log("\nNothing written. Re-run with --apply.");
    return;
  }

  const backup = path.join(BACKUP_DIR, `milwaukee-sync.backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(backup, JSON.stringify({ updates: updates.map((u) => u.row), deletions }, null, 1));
  console.log(`Backup: ${backup}`);

  await prisma.$transaction(
    async (tx: typeof prisma) => {
      for (const u of updates) await tx.milwaukeeCategory.update({ where: { id: u.row.id }, data: u.data });
      // Parents before children, so a new subgroup can find its new group.
      for (const type of ["CATEGORY", "GROUP", "SUBGROUP"] as const) {
        for (const c of creates.filter((x) => x.type === type)) {
          const parentType = type === "GROUP" ? "CATEGORY" : "GROUP";
          const parent =
            c.parentCode == null
              ? null
              : await tx.milwaukeeCategory.findFirst({ where: { erpCode: c.parentCode, erpType: parentType } });
          if (type !== "CATEGORY" && !parent) continue;
          await tx.milwaukeeCategory.create({
            data: { parentId: parent?.id ?? null, erpCode: c.code, erpType: type, order: c.order, ...c.data },
          });
        }
      }
      for (const d of deletions) await tx.milwaukeeCategory.delete({ where: { id: d.id } });
      for (const b of backfill) {
        if (b.type === "CATEGORY") await tx.softCategory.updateMany({ where: { CODE: b.code }, data: b.data });
        else if (b.type === "GROUP") await tx.softGroup.updateMany({ where: { CODE: b.code }, data: b.data });
        else await tx.softSubgroup.updateMany({ where: { SHORT: b.code, MTRGROUP: b.parentCode ?? "" }, data: b.data });
      }
    },
    { timeout: 120_000 },
  );
  console.log("Written.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
