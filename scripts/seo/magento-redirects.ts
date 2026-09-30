/**
 * Builds the 301 table from the old milwaukeetoolshdc.gr to this shop.
 *
 *   npx tsx --env-file=.env scripts/seo/magento-redirects.ts [--crawl] [--urls file.txt]
 *
 * Writes src/config/magento-redirects.json (read by src/proxy.ts through
 * src/lib/seo/magento-redirects.ts) and docs/seo/magento-redirects-report.md.
 *
 * The database is only READ: active products (code2 / code / code1 → slug) and
 * categories with products (name → slug). See the module for why the table is
 * keyed by code rather than by old URL: the old product URL ends in its SKU.
 *
 * --crawl   fetch the old site's robots.txt and, ONLY if it allows it, its
 *           sitemaps (sequential, one request a second, a normal browser UA,
 *           capped). The URLs found are resolved and reported; they do not
 *           need rows of their own unless they fail to resolve.
 *           On 30/9/2026 the old site answers `Disallow: /`, so nothing is
 *           crawled.
 * --urls    a file of old URLs or paths, one per line (a Search Console or
 *           analytics export), resolved and reported the same way.
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../src/lib/prisma";
import { slugify } from "../../src/lib/greek";
import {
  buildMagentoTable,
  categorySkeleton,
  createMagentoResolver,
  normaliseCode,
  type MagentoKind,
} from "../../src/lib/seo/magento-redirects";

const OLD_ORIGIN = "https://milwaukeetoolshdc.gr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const MAX_SITEMAPS = 50;
const MAX_URLS = 20000;

const ROOT = path.resolve(__dirname, "../..");
const JSON_OUT = path.join(ROOT, "src/config/magento-redirects.json");
const REPORT_OUT = path.join(ROOT, "docs/seo/magento-redirects-report.md");

/**
 * Paths linked from the old site's home page on 30/9/2026 (one page view, before
 * its robots.txt was read). Kept as a regression sample: every one of these
 * must resolve to a real page.
 */
const OBSERVED = [
  "/about-us", "/careers", "/category-listing", "/contact-us", "/faqs", "/new-products",
  "/payment-methods", "/popular-products", "/privacy-policy", "/return-policy", "/reviews",
  "/shipment-delivery", "/terms-and-conditions", "/top-products", "/track-order",
  "/category-10-ergaleia-cheiros", "/category-12-ergaleia-mpatarias",
  "/category-18-metafora-apothikeysi-thesi-ergasias", "/category-24-organa-metrisis-metrisi-charaxi",
  "/category-28-mesa-atomikis-prostasias-odopoiia",
  "/category-35-exartimata-ilektrikon-ergaleion-kai-mpatarias",
  "/alfadi-laser-aytorythm-no-m12-3pl-401c-4933478102", "/amperotsimpida-600a-2235-40-4933427315",
  "/dimetro-synthetiko-ptyssomeno-4932459301",
  "/flextred-boa-s1ps-papoytsi-asfaleias-no-45-b1l110133-4932498089",
  "/flextred-mpez-nubuck-s3s-mpotaki-asfaleias-no-45-1m171311-4932493749",
  "/flextred-mpez-nubuck-s3s-mpotaki-asfaleias-no-46-1m171311-4932493750",
  "/flextred-nubuck-boa-s3s-mpotaki-asfaleias-no-43-b1m110133-4932498126",
  "/flextred-nubuck-boa-s3s-papoytsi-asfaleias-no-41-b1l110133-4932498111",
  "/flextred-nubuck-boa-s3s-papoytsi-asfaleias-no-45b1l110133-4932498115",
  "/flextred-nubuck-boa-s3s-papoytsi-asfaleias-no-46-b1l110133-4932498116",
  "/flextred-nubuck-s3s-papoytsi-asfaleias-no-44-1l110133-4932493722",
  "/flextred-nubuck-s3s-papoytsi-asfaleias-no-45-1l110133-4932493723",
  "/flextred-nubuck-s3s-papoytsi-asfaleias-no-46-1l110133-4932493724",
  "/kasetina-karydakia-1-4-28tem-4932464943", "/kasetina-karydakia-3-8-32tem-4932464945",
  "/katsabidi-karydaki-magnitiko-8mm-hallowcore-48222535",
  "/laser-aytorythmizomeno-comp-m12-3plkit-401-p-4933478960", "/laser-m12-cll4p-301c-4933479203",
  "/machairi-6-se-1-fastback-4932478559", "/markadoros-mayros-leptis-mytis-48223100",
  "/markadoros-me-mpilia-mayros-48223731", "/mpataria-18v-5-0ah-m18-b5-4932430483",
  "/mpataria-li-ion-m12b2-2-0ah-4932430064", "/mpataria-li-ion-m12b4-4ah-4932430065",
  "/mpataria-li-ion-m12b6-6ah-4932451395", "/mpataries-18v-2-ah-4932430062",
  "/mytes-adaptor-set-32-tem-shockwave-drive-4932464240",
  "/mytes-shockwave-ph-2x50mm-set-10-tem-4932430855",
  "/potirotrypano-m14-diamond-max-5mm-4932471758", "/potirotrypano-m14-diamond-max-6mm-4932471759",
  "/potirotrypano-m14-diamond-max-8mm-4932471760", "/set-mpataries-fortistis-m12-nrg-202-4933459209",
  "/set-mpataries-fortistis-m18-nrg-503-4933451423", "/skyla-pensa-250mm-kampyloti-4932471725",
  "/tileskopikos-solinokaboyras-24-48227314", "/trigono-maragkoy-michanoyrgoy-4932472124",
  "/usb-grammiko-laser-l4-cllp-301c-4933478099", "/usb-laser-2-grammon-l4-cll-301c-4933478098",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function politeGet(url: string): Promise<string | null> {
  await sleep(1000);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  return res.ok ? res.text() : null;
}

/** `Disallow: /` for every agent — the old site's answer on 30/9/2026. */
function robotsForbidsAll(robots: string): boolean {
  let appliesToAll = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(key)) appliesToAll = value === "*";
    else if (appliesToAll && /^disallow$/i.test(key) && value === "/") return true;
  }
  return false;
}

async function crawlSitemaps(log: string[]): Promise<string[]> {
  const robots = (await politeGet(`${OLD_ORIGIN}/robots.txt`)) ?? "";
  if (robotsForbidsAll(robots)) {
    log.push("robots.txt says `Disallow: /` for every agent: no sitemap was fetched.");
    return [];
  }
  const queue = robots
    .split(/\r?\n/)
    .filter((l) => /^sitemap:/i.test(l.trim()))
    .map((l) => l.trim().slice("sitemap:".length).trim());
  if (!queue.length) queue.push(`${OLD_ORIGIN}/sitemap.xml`);

  const urls: string[] = [];
  let fetched = 0;
  while (queue.length && fetched < MAX_SITEMAPS && urls.length < MAX_URLS) {
    const xml = await politeGet(queue.shift()!);
    fetched++;
    if (!xml) continue;
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    if (/<sitemapindex/i.test(xml)) queue.push(...locs);
    else urls.push(...locs);
  }
  log.push(`Fetched ${fetched} sitemap(s), ${urls.length} URL(s).`);
  return urls.slice(0, MAX_URLS);
}

function toPath(line: string): string | null {
  const text = line.trim();
  if (!text) return null;
  try {
    const url = new URL(text, OLD_ORIGIN);
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const crawl = args.includes("--crawl");
  const urlsFile = args.includes("--urls") ? args[args.indexOf("--urls") + 1] : null;
  const log: string[] = [];

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: { code: true, code1: true, code2: true, slug: true, mtrl: true },
    }),
    prisma.category.findMany({ select: { slug: true, nameEl: true, productCount: true, erpType: true } }),
  ]);

  const LEVEL = { CATEGORY: 0, GROUP: 1, SUBGROUP: 2 } as const;
  const table = buildMagentoTable({
    products,
    categories: categories.map((c) => ({ ...c, level: LEVEL[c.erpType] })),
  });
  const resolve = createMagentoResolver(table);

  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(
    JSON_OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        products: table.products,
        categories: table.categories,
        redirects: table.redirects,
        ambiguous: table.ambiguous,
      },
      null,
      0,
    ) + "\n",
  );

  // Coverage from the catalogue side: an old product URL ends in its SKU, so a
  // product is reachable when its normalised code2 maps to it alone.
  const productsByCode2 = products.filter(
    (p) => !!table.products[normaliseCode(p.code2)],
  );
  const unreachable = products.filter((p) => !productsByCode2.includes(p));
  const listedCategories = categories.filter((c) => c.productCount > 0);
  // A category counts as matched when an old URL with its name lands on a
  // category page — its own, or the top-level one of the same name.
  const unmappedCategories = listedCategories.filter(
    (c) => !table.categories[categorySkeleton(slugify(c.nameEl) || c.slug)],
  );

  let external: string[] = [];
  if (crawl) external = await crawlSitemaps(log);
  else log.push("Sitemap crawl not requested (--crawl).");
  if (urlsFile) {
    external.push(...fs.readFileSync(urlsFile, "utf8").split(/\r?\n/));
    log.push(`Read ${urlsFile}.`);
  }

  const check = (paths: string[]) =>
    paths
      .map(toPath)
      .filter((p): p is string => !!p)
      .map((p) => {
        const [pathname, search = ""] = p.split(/(?=\?)/);
        const hit = resolve(pathname, search);
        return { from: p, to: hit?.to ?? null, kind: (hit?.kind ?? "none") as MagentoKind | "none" };
      });

  const observed = check(OBSERVED);
  const externalResults = check(external);
  const count = (rows: { kind: string }[], kind: string) => rows.filter((r) => r.kind === kind).length;
  const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) : "0.0") + "%";

  const observedProducts = observed.filter((r) => /-\d{4,}$/.test(r.from) && !r.from.startsWith("/category-"));
  const observedCategories = observed.filter((r) => /^\/category-\d+-/.test(r.from));

  const lines = [
    "# Magento → hdc-front 301 map — report",
    "",
    `Generated ${new Date().toISOString()} by \`scripts/seo/magento-redirects.ts\`.`,
    "",
    "## How old URLs are resolved",
    "",
    "The old milwaukeetoolshdc.gr is a headless storefront over Magento. Its product URLs end in the",
    "SKU (`/mpataria-18v-5-0ah-m18-b5-4932430483`), which is our `code2`; its categories are",
    "`/category-<id>-<name-slug>`. So `src/config/magento-redirects.json` maps every normalised code",
    "(code2, code, code1; spaces/dashes stripped, case-insensitive; exact match only) to its product,",
    "and every category name (old and new transliteration folded together) to its category.",
    "Anything not found goes to `/anazitisi?q=<code or name>` — never a 404.",
    "",
    "## Crawl",
    "",
    ...log.map((l) => `- ${l}`),
    "",
    "## Coverage",
    "",
    `| | matched | total | coverage |`,
    `|---|---:|---:|---:|`,
    `| Products (an old URL ending in its code2 resolves) | ${productsByCode2.length} | ${products.length} | ${pct(productsByCode2.length, products.length)} |`,
    `| Categories with products (by name) | ${listedCategories.length - unmappedCategories.length} | ${listedCategories.length} | ${pct(listedCategories.length - unmappedCategories.length, listedCategories.length)} |`,
    `| Observed old product URLs | ${count(observedProducts, "product")} | ${observedProducts.length} | ${pct(count(observedProducts, "product"), observedProducts.length)} |`,
    `| Observed old category URLs | ${count(observedCategories, "category")} | ${observedCategories.length} | ${pct(count(observedCategories, "category"), observedCategories.length)} |`,
    ...(externalResults.length
      ? [
          `| Crawled / supplied URLs resolved to a product, category or page | ${externalResults.filter((r) => r.kind !== "search" && r.kind !== "none").length} | ${externalResults.length} | ${pct(externalResults.filter((r) => r.kind !== "search" && r.kind !== "none").length, externalResults.length)} |`,
        ]
      : []),
    "",
    `Table size: ${Object.keys(table.products).length} codes, ${Object.keys(table.categories).length} category names.`,
    "",
    "## Observed old URLs (sample from the old home page)",
    "",
    "| old | new | kind |",
    "|---|---|---|",
    ...observed.map((r) => `| \`${r.from}\` | \`${r.to ?? "—"}\` | ${r.kind} |`),
    "",
    "## Not matched",
    "",
    `### Products whose code2 does not resolve (${unreachable.length})`,
    "",
    "Each code below belongs to two ERP products; the old URL goes to the search for the code, which lists both.",
    "",
    ...(unreachable.length
      ? unreachable.map((p) => `- \`${p.code2}\` (${p.slug}) — an old URL ending in this code goes to the search`)
      : ["None."]),
    "",
    `### Ambiguous codes left out (${table.ambiguous.codes.length})`,
    "",
    table.ambiguous.codes.length ? table.ambiguous.codes.map((c) => `\`${c}\``).join(", ") : "None.",
    "",
    `### Categories with products whose name is shared at the same level (${unmappedCategories.length})`,
    "",
    "An old link with one of these names goes to the search for the name: the old URL carries only the",
    "leaf name and a Magento id, and the Magento-id → PIM mapping lives in HDCtool (MagentoCategoryMapping),",
    "not in this database.",
    "",
    ...(unmappedCategories.length
      ? unmappedCategories.map((c) => `- ${c.nameEl} (\`${c.slug}\`, ${c.erpType.toLowerCase()})`)
      : ["None."]),
    "",
    ...(externalResults.some((r) => r.kind === "search" || r.kind === "none")
      ? [
          "### Crawled / supplied URLs that fall back to the search",
          "",
          ...externalResults
            .filter((r) => r.kind === "search" || r.kind === "none")
            .map((r) => `- \`${r.from}\` → \`${r.to ?? "—"}\``),
          "",
        ]
      : []),
    "## Uncertain",
    "",
    "- The old site's full URL list could not be read (robots.txt `Disallow: /`); coverage is measured",
    "  from our catalogue and from the URLs linked on its home page.",
    "- Old category names are matched by name. A Magento category whose name differs from every",
    "  category here falls back to the search for its name.",
    "- Page aliases other than those linked from the old site (see `MAGENTO_PAGES`) are common",
    "  Magento/PWA names, not observed ones.",
    "",
  ];

  fs.mkdirSync(path.dirname(REPORT_OUT), { recursive: true });
  fs.writeFileSync(REPORT_OUT, lines.join("\n"));

  console.log(
    `products ${productsByCode2.length}/${products.length}, categories ${listedCategories.length - unmappedCategories.length}/${listedCategories.length}, ` +
      `observed products ${count(observedProducts, "product")}/${observedProducts.length}, observed categories ${count(observedCategories, "category")}/${observedCategories.length}`,
  );
  console.log(`wrote ${path.relative(ROOT, JSON_OUT)} and ${path.relative(ROOT, REPORT_OUT)}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
