import { prisma } from "../src/lib/prisma";
import { milwaukeeFields } from "../src/lib/milwaukee/product-fields";

/**
 * One-off backfill: fills `platform` / `modelRoot` / `modelContent` /
 * `isFuel` / `isOneKey` for every existing product from its name.
 *
 *   npm run backfill:milwaukee
 *
 * Sync (`upsertProduct` in `catalog-sync.ts`) has computed these on every
 * create/update since this migration; this script only needs to run once, to
 * fill the 2.864 rows that were written before that.
 *
 * Reads id + name in batches of 500, then writes each batch with ONE
 * parameterised `UPDATE … FROM (VALUES …)` statement — not one round trip per
 * row. `backfill-price-net.ts` set that pattern after a per-row version (9.727
 * round trips) got cut off halfway by the shared Postgres.
 */

const BATCH = 500;

async function main() {
  const dry = process.argv.includes("--dry");

  const total = await prisma.product.count();
  console.log(`products ${total}`);

  let cursor: string | undefined;
  let scanned = 0;
  let written = 0;
  const platformCounts: Record<string, number> = {};

  for (;;) {
    const rows = await prisma.product.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;

    const values = rows.map((r, i) => {
      const f = milwaukeeFields(r.name);
      platformCounts[f.platform ?? "null"] = (platformCounts[f.platform ?? "null"] ?? 0) + 1;
      const base = i * 6;
      return `($${base + 1}::text, $${base + 2}::varchar, $${base + 3}::varchar, $${base + 4}::varchar, $${base + 5}::boolean, $${base + 6}::boolean)`;
    });
    const params = rows.flatMap((r) => {
      const f = milwaukeeFields(r.name);
      return [r.id, f.platform, f.modelRoot, f.modelContent, f.isFuel, f.isOneKey];
    });

    if (!dry) {
      const affected = await prisma.$executeRawUnsafe(
        `UPDATE products SET
           "platform" = v.platform,
           "modelRoot" = v."modelRoot",
           "modelContent" = v."modelContent",
           "isFuel" = v."isFuel",
           "isOneKey" = v."isOneKey"
         FROM (VALUES ${values.join(",")}) AS v(id, platform, "modelRoot", "modelContent", "isFuel", "isOneKey")
         WHERE products.id = v.id`,
        ...params,
      );
      written += affected;
    }
    console.log(`  batch ending ${cursor}: scanned=${scanned}`);
  }

  console.log(`\nscanned=${scanned} written=${written}${dry ? " (dry run, nothing written)" : ""}`);
  console.log("platform counts:", platformCounts);
}

main()
  .catch((e) => {
    console.error("FAILED", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
