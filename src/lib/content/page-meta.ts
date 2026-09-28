import type { Metadata } from "next";
import type { Locale } from "@/i18n/routing";
import { pageMeta } from "@/lib/seo/urls";

/**
 * Metadata for a content page. Legal and service pages stay out of the index
 * (`noindex, follow`) as before: boilerplate has no place competing for a
 * search snippet. The FAQ, contact and company pages are indexed.
 */
export function contentMetadata(input: {
  path: string;
  locale: Locale;
  title: string;
  description: string;
  index?: boolean;
}): Metadata {
  const { path, locale, title, description, index = false } = input;
  return {
    ...pageMeta({ path, locale, title, description }),
    title,
    description,
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}
