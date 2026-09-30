import { siteOrigin } from "@/lib/seo/urls";
import { sitemapIndexXml } from "@/lib/seo/sitemap-xml";
import { SITEMAPS } from "@/lib/seo/sitemap-data";

/**
 * /sitemap.xml — the index over one sitemap per kind of page
 * (/sitemaps/<kind>.xml): pages, categories, models and hubs, products (with
 * their images), articles. Greek URLs only. Per request: the build container
 * cannot reach the database, and the index costs nothing.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const origin = siteOrigin();
  return new Response(sitemapIndexXml(SITEMAPS.map((kind) => ({ loc: `${origin}/sitemaps/${kind}.xml` }))), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
