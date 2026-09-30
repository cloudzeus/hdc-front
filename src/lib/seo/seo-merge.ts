import type { FaqPair } from "@/lib/seo/product-faq";

/**
 * Hand-written SEO copy over the automatic one, field by field.
 *
 * A `SeoOverride` row (admin «SEO & Περιεχόμενο», or imported from
 * docs/content/seo) may fill any of its fields; an empty one means the page's
 * own generated text applies. So a page is never blank because somebody saved
 * half a form, and clearing a field restores the automatic text rather than
 * leaving a hole. Pure — `seoFor()` in seo-for.ts reads the row.
 */

export type AutoSeo = {
  h1: string;
  title: string;
  description: string;
  intro?: string | null;
  body?: string | null;
  faq?: FaqPair[];
};

export type SeoOverrideFields = {
  h1?: string | null;
  seoTitle?: string | null;
  metaDescription?: string | null;
  intro?: string | null;
  body?: string | null;
  faq?: unknown;
  relatedArticles?: unknown;
  relatedCategories?: unknown;
};

export type ResolvedSeo = {
  h1: string;
  title: string;
  description: string;
  intro: string | null;
  body: string | null;
  faq: FaqPair[];
  relatedArticles: string[];
  relatedCategories: string[];
  /** Which fields came from the override — for the admin's preview. */
  overridden: Array<"h1" | "title" | "description" | "intro" | "body" | "faq">;
};

const filled = (value: string | null | undefined): string | null => {
  const v = value?.trim();
  return v ? v : null;
};

export function faqFromJson(value: unknown): FaqPair[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const q = filled((item as { q?: unknown })?.q as string);
      const a = filled((item as { a?: unknown })?.a as string);
      return typeof q === "string" && typeof a === "string" ? { q, a } : null;
    })
    .filter((p): p is FaqPair => p != null);
}

export function stringsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

export function mergeSeo(auto: AutoSeo, override: SeoOverrideFields | null | undefined): ResolvedSeo {
  const o = override ?? {};
  const overridden: ResolvedSeo["overridden"] = [];
  const pick = <T>(field: ResolvedSeo["overridden"][number], mine: T | null, fallback: T): T => {
    if (mine == null) return fallback;
    overridden.push(field);
    return mine;
  };
  const faq = faqFromJson(o.faq);

  return {
    h1: pick("h1", filled(o.h1), auto.h1),
    title: pick("title", filled(o.seoTitle), auto.title),
    description: pick("description", filled(o.metaDescription), auto.description),
    intro: pick("intro", filled(o.intro), filled(auto.intro)),
    body: pick("body", filled(o.body), filled(auto.body)),
    faq: pick("faq", faq.length ? faq : null, auto.faq ?? []),
    relatedArticles: stringsFromJson(o.relatedArticles),
    relatedCategories: stringsFromJson(o.relatedCategories),
    overridden,
  };
}
