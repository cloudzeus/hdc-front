import { normalizeModelText, parseModel } from "@/lib/milwaukee/model";
import { modelPath } from "@/lib/milwaukee/model-slug";

/**
 * Searching an article number or a model lands on its page.
 *
 * Someone who types 4933479860 or «M18 FPD3» into the search box, or arrives
 * from a search engine with it, wants that product or that model — not a
 * results page with one card. So:
 *
 *   a code (article number, EAN, our code) of exactly ONE active product → its page
 *   a full model code («M18 FPD3-502X») of exactly one version          → its page
 *   a model («M18 FPD3», «m18fpd3», «m18-fpd3») the store lists         → the model page
 *
 * Anything ambiguous or unknown stays a search. Pure; the page does the lookups.
 */

export type ModelQuery = { root: string; code: string | null };

const ROOT_ONLY = /^(M12|M18|MXF) ([A-Z][A-Z0-9]*)$/;

/** The query as a model, when that is all it is. */
export function parseModelQuery(query: string): ModelQuery | null {
  let text = query.trim().toUpperCase().replace(/\s+/g, " ");
  if (!text || text.length > 40) return null;
  text = text.replace(/^MX ?FUEL /, "MXF ").replace(/^(M12|M18|MXF)-(?=[A-Z])/, "$1 ");
  text = normalizeModelText(text);
  const full = parseModel(text);
  if (full && text === full.code) return { root: full.root, code: full.code };
  const root = ROOT_ONLY.exec(text);
  return root ? { root: `${root[1]} ${root[2]}`, code: null } : null;
}

export function searchRedirectPath(input: {
  /** Slugs of active products whose code, EAN or article number is the query (two at most are enough). */
  codeMatches: string[];
  model: ModelQuery | null;
  /** The active versions of `model.root`, with their full codes. */
  modelVersions: Array<{ slug: string; code: string | null }>;
}): string | null {
  if (input.codeMatches.length === 1) return `/proion/${input.codeMatches[0]}`;
  if (input.codeMatches.length > 1 || !input.model || input.modelVersions.length === 0) return null;
  if (input.model.code) {
    const hits = input.modelVersions.filter((v) => v.code === input.model!.code);
    if (hits.length === 1) return `/proion/${hits[0].slug}`;
  }
  return modelPath(input.model.root);
}
