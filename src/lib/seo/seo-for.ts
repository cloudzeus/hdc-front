import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import type { SeoTargetType } from "@/generated/prisma/client";
import { mergeSeo, type AutoSeo, type ResolvedSeo } from "@/lib/seo/seo-merge";

/**
 * The SEO copy a page shows: its `SeoOverride` over its automatic text.
 *
 * Greek only — SEO targets the Greek market (owner decision, 30/9/2026), so
 * the overrides are written in Greek and an en/it page keeps its own
 * generated text rather than showing Greek.
 *
 * One query per page (React `cache`), not a shared cache: an edit in the admin
 * shows on the next view.
 */
export const getSeoOverride = cache((targetType: SeoTargetType, targetKey: string) =>
  prisma.seoOverride.findUnique({ where: { targetType_targetKey: { targetType, targetKey } } }).catch((error) => {
    console.error(`[seo] could not read the override for ${targetType} ${targetKey}`, error);
    return null;
  }),
);

export async function seoFor(
  targetType: SeoTargetType,
  targetKey: string,
  locale: Locale,
  auto: AutoSeo,
): Promise<ResolvedSeo> {
  if (locale !== "el") return mergeSeo(auto, null);
  return mergeSeo(auto, await getSeoOverride(targetType, targetKey));
}
