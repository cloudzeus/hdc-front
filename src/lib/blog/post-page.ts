import type { Metadata } from "next";
import type { Locale } from "@/i18n/routing";
import { BlogMethodMissing } from "@/lib/blog/blog";
import type { BlogPost } from "@/lib/blog/contract";
import { pageMeta } from "@/lib/seo/urls";

/**
 * The post, or null when there is none — including while HDCtool has no posts
 * endpoint at all. Until it does, no slug is a post, and the page answers 404
 * for every one rather than a 200 "coming soon" for any URL anyone types (an
 * unbounded supply of soft 404s). Any other failure is not "no post" and is
 * rethrown.
 */
export async function loadBlogPost(fetchPost: () => Promise<BlogPost | null>): Promise<BlogPost | null> {
  try {
    return await fetchPost();
  } catch (error) {
    if (error instanceof BlogMethodMissing) return null;
    throw error;
  }
}

/**
 * A post's metadata: its own canonical and language alternates (it used to
 * inherit the site root's), and Open Graph as an article.
 */
export function blogPostMetadata(post: BlogPost, locale: Locale): Metadata {
  const description = post.shortDescription ?? undefined;
  const meta = pageMeta({
    path: `/blog/${post.slug}`,
    locale,
    title: post.title,
    description: description ?? post.title,
    image: post.image?.url,
    type: "article",
  });
  return {
    ...meta,
    openGraph: { ...meta.openGraph, publishedTime: post.publishedAt, modifiedTime: post.updatedAt },
    title: post.title,
    description,
  };
}
