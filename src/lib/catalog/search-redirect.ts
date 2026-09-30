import "server-only";
import { prisma } from "@/lib/prisma";
import { getModelProducts } from "@/lib/catalog/models";
import { exactCodeWhere } from "@/lib/catalog/suggest";
import { parseModel } from "@/lib/milwaukee/model";
import { parseModelQuery, searchRedirectPath } from "@/lib/seo/search-redirect";

/**
 * Where a search for `query` should land instead of the results page, or
 * null to show results (src/lib/seo/search-redirect.ts has the rule).
 * Two indexed lookups at most: the exact code, and the model's versions.
 */
export async function searchRedirectTarget(query: string): Promise<string | null> {
  const q = query.trim().slice(0, 64);
  if (q.length < 3) return null;
  const model = parseModelQuery(q);
  const [codeRows, versions] = await Promise.all([
    prisma.product.findMany({ where: exactCodeWhere(q), select: { slug: true }, take: 2 }),
    model ? getModelProducts(model.root) : Promise.resolve([]),
  ]);
  return searchRedirectPath({
    codeMatches: codeRows.map((r) => r.slug),
    model,
    modelVersions: versions.map((v) => ({ slug: v.slug, code: parseModel(v.name)?.code ?? null })),
  });
}
