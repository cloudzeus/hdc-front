import { prisma } from "@/lib/prisma";
import { siteOrigin } from "@/lib/seo/urls";
import { groupModels, llmsFullTxt } from "@/lib/seo/llms";
import { sharedCatalogue } from "@/lib/catalog/shared-cache";
import { publishedForLlms } from "@/lib/blog/articles";

/**
 * llms-full.txt — every M12, M18 and MX FUEL model the store lists, with each
 * version's article number and page, straight from the catalogue.
 *
 * Rendered on request, never at build (the build container cannot reach the
 * database). The catalogue read is kept for a day in the shared catalogue
 * cache (tagged `catalogue`), so a crawler hammering the file costs one query
 * a day. Nothing revalidates that tag when the catalogue syncs, so a model
 * added today appears here within 24 hours, not at once.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 60 * 60 * 24;

const modelRows = sharedCatalogue("llms-full-models-v2", DAY, () =>
  prisma.product.findMany({
    // Not filtered on `modelRoot`: `groupModels` also reads the model from the
    // name, for rows the sync has not re-parsed yet.
    where: { isActive: true, platform: { not: null } },
    select: { name: true, code2: true, slug: true, platform: true, modelRoot: true, modelContent: true },
  }),
);

export async function GET() {
  const [rows, articles] = await Promise.all([modelRows(), publishedForLlms().catch(() => [])]);
  return new Response(llmsFullTxt(siteOrigin(), groupModels(rows), articles), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
