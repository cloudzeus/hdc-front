import { describe, expect, it } from "vitest";
import { BlogMethodMissing } from "@/lib/blog/blog";
import type { BlogPost } from "@/lib/blog/contract";
import { blogPostMetadata, loadBlogPost } from "@/lib/blog/post-page";

/**
 * A blog post is its own page: its own canonical — Greek only, no en/it
 * alternates (owner decision: SEO is for the Greek market only) — not
 * the site root's. And while HDCtool has no posts endpoint, no slug is a post —
 * so every one is a real 404, not a 200 "coming soon" page for any URL anyone
 * types (a soft 404 to Google, and an endless supply of them).
 */
const post: BlogPost = {
  slug: "m18-fuel-guide",
  title: "Οδηγός M18 FUEL",
  shortDescription: "Ποιο δράπανο για ποια δουλειά.",
  image: { url: "https://cdn.example/m18.jpg", mainImage: true, width: 1200, height: 630 },
  publishedAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-02T08:00:00.000Z",
  readingMinutes: 4,
  content: "<p>…</p>",
  images: [],
};

describe("loadBlogPost", () => {
  it("returns the post", async () => {
    expect(await loadBlogPost(async () => post)).toBe(post);
  });

  it("treats a missing endpoint as no post", async () => {
    expect(
      await loadBlogPost(async () => {
        throw new BlogMethodMissing("/api/public/posts/x");
      }),
    ).toBeNull();
  });

  it("does not swallow a real failure", async () => {
    await expect(
      loadBlogPost(async () => {
        throw new Error("HDCtool down");
      }),
    ).rejects.toThrow("HDCtool down");
  });
});

describe("blogPostMetadata", () => {
  const meta = blogPostMetadata(post, "el");

  it("gives the post its own Greek canonical and no en/it alternates", () => {
    expect(String(meta.alternates?.canonical)).toMatch(/\/blog\/m18-fuel-guide$/);
    expect(String(meta.alternates?.canonical)).not.toMatch(/\/(en|it)\//);
    expect(meta.alternates?.languages).toBeUndefined();
  });

  it("keeps the Greek canonical on an en/it copy, which is not for search", () => {
    const en = blogPostMetadata(post, "en");
    expect(String(en.alternates?.canonical)).not.toMatch(/\/en\//);
    expect(en.alternates?.languages).toBeUndefined();
    expect(en.robots).toEqual({ index: false, follow: true });
  });

  it("is an article with its title, description, date and image", () => {
    expect(meta.title).toBe(post.title);
    expect(meta.description).toBe(post.shortDescription);
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.type).toBe("article");
    expect(og.publishedTime).toBe(post.publishedAt);
    expect(og.url).toMatch(/\/blog\/m18-fuel-guide$/);
    expect(JSON.stringify(og.images)).toContain(post.image!.url);
  });
});
