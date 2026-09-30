/**
 * Sitemap XML, written by hand: an index (/sitemap.xml) over one sitemap per
 * kind of page (/sitemaps/<kind>.xml), and image entries on the product
 * sitemap — which Next's `sitemap.ts` convention cannot produce together.
 * Greek URLs only, so no hreflang (SEO is Greek only).
 */

export type SitemapEntry = {
  loc: string;
  lastmod?: Date | string | null;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
  images?: string[];
};

const xml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString());

export function urlsetXml(entries: SitemapEntry[]): string {
  const urls = entries.map((e) => {
    const parts = [`<loc>${xml(e.loc)}</loc>`];
    if (e.lastmod) parts.push(`<lastmod>${xml(iso(e.lastmod))}</lastmod>`);
    if (e.changefreq) parts.push(`<changefreq>${e.changefreq}</changefreq>`);
    if (e.priority != null) parts.push(`<priority>${e.priority.toFixed(1)}</priority>`);
    for (const image of e.images ?? []) parts.push(`<image:image><image:loc>${xml(image)}</image:loc></image:image>`);
    return `<url>${parts.join("")}</url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urls,
    "</urlset>",
  ].join("\n");
}

export function sitemapIndexXml(items: Array<{ loc: string; lastmod?: Date | string | null }>): string {
  const maps = items.map(
    (i) => `<sitemap><loc>${xml(i.loc)}</loc>${i.lastmod ? `<lastmod>${xml(iso(i.lastmod))}</lastmod>` : ""}</sitemap>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...maps,
    "</sitemapindex>",
  ].join("\n");
}
