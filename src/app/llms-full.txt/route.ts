import { prisma } from "@/lib/prisma";
import { siteOrigin } from "@/lib/seo/urls";
import { groupModels, llmsFullTxt } from "@/lib/seo/llms";

/**
 * llms-full.txt — every M12, M18 and MX FUEL model the store lists, with each
 * version's article number and page, straight from the catalogue.
 *
 * Rendered per request and cached for a day, not at build: the build container
 * cannot reach the database (same reasoning as the feeds).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.product.findMany({
    where: { isActive: true, modelRoot: { not: null }, platform: { not: null } },
    select: { name: true, code2: true, slug: true, platform: true, modelRoot: true, modelContent: true },
  });

  return new Response(llmsFullTxt(siteOrigin(), groupModels(rows)), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
