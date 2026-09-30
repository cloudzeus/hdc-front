import { SITEMAPS, sitemapEntries, type SitemapKind } from "@/lib/seo/sitemap-data";
import { urlsetXml } from "@/lib/seo/sitemap-xml";

/**
 * /sitemaps/<kind>.xml — one of the sitemaps listed in /sitemap.xml.
 * Built per request (the catalogue changes during the day; about 45 products
 * a day are added), cached by crawlers for an hour.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const kind = file.replace(/\.xml$/, "") as SitemapKind;
  if (!file.endsWith(".xml") || !SITEMAPS.includes(kind)) return new Response("Not found", { status: 404 });
  return new Response(urlsetXml(await sitemapEntries(kind)), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
