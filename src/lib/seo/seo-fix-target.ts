import type { SeoTargetType } from "@/generated/prisma/client";
import { modelRootFromSlug } from "@/lib/milwaukee/model-slug";
import { HUB_KEYS, HUBS } from "@/lib/seo/hubs";
import { SEO_FIELDS, type SeoFieldName } from "@/lib/seo/seo-fix-protocol";

export type SeoFixTarget = { targetType: SeoTargetType; targetKey: string; allowed: SeoFieldName[] };

const target = (targetType: SeoTargetType, targetKey: string, allowed: readonly SeoFieldName[] = SEO_FIELDS): SeoFixTarget => ({
  targetType,
  targetKey,
  allowed: [...allowed],
});

/** The `SeoOverride` row a storefront path reads. `null`: the page has none HDCtool may write. */
export function seoTargetForPath(path: string): SeoFixTarget | null {
  if (path === "/") return target("PAGE", "/");
  const hub = HUB_KEYS.find((key) => HUBS[key].path === path);
  if (hub) return target("PLATFORM", hub);

  const [, section, slug, rest] = path.split("/");
  if (!slug || rest !== undefined) return null;
  if (section === "katalogos") return target("CATEGORY", slug);
  // Product pages have no FAQ section to show an override in.
  if (section === "proion") return target("PRODUCT", slug, ["seoTitle", "metaDescription"]);
  if (section !== "montelo") return null;
  const root = modelRootFromSlug(slug);
  return root ? target("MODEL", root) : null;
}
