import "server-only";
import type { Locale } from "@/i18n/routing";
import type { BlogListResponse } from "@/lib/blog/contract";
import { listArticles } from "@/lib/blog/articles";

/**
 * The blog's published articles, newest first — for callers outside the blog
 * pages (the newsletter's content picker). Greek only: the articles are
 * written in Greek, whatever the locale asked for. See articles.ts.
 */
export function getBlogPosts(_locale: Locale, page = 1, perPage = 12): Promise<BlogListResponse> {
  return listArticles("ARTICLE", page, perPage);
}
