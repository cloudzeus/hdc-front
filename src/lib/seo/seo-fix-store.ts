import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { SeoFixStore } from "@/lib/seo/seo-fix-protocol";
import { seoTargetForPath } from "@/lib/seo/seo-fix-target";
import { faqFromJson } from "@/lib/seo/seo-merge";

// `handleSeoFix` only reaches read/write for a path `allowed` accepted.
function keyOf(path: string) {
  const target = seoTargetForPath(path);
  if (!target) throw new Error(`No SEO target for ${path}`);
  return { targetType: target.targetType, targetKey: target.targetKey };
}

/** The same `SeoOverride` row the admin edits; only these three fields, so its h1, intro and body stay. */
export const seoFixStore: SeoFixStore = {
  allowed: (path) => seoTargetForPath(path)?.allowed ?? null,

  async read(path) {
    const row = await prisma.seoOverride.findUnique({ where: { targetType_targetKey: keyOf(path) } });
    const faq = faqFromJson(row?.faq);
    return { seoTitle: row?.seoTitle ?? null, metaDescription: row?.metaDescription ?? null, faq: faq.length ? faq : null };
  },

  async write(path, { faq, ...text }, updatedBy) {
    const key = keyOf(path);
    const data = { ...text, updatedBy, ...(faq === undefined ? {} : { faq: faq ?? Prisma.DbNull }) };
    await prisma.seoOverride.upsert({ where: { targetType_targetKey: key }, create: { ...key, ...data }, update: data });
  },
};
