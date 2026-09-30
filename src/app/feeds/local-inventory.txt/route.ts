import { buildLocalInventoryFeed, localStoreCode } from "@/lib/feeds/local-inventory";

/**
 * The local inventory data source Merchant Center fetches.
 *
 * A tab-separated file, not XML — see `local-inventory.ts` for why this is a
 * different shape from the product feed rather than an extension of it.
 *
 * Same reasoning as `google-merchant.xml` on the two route-config lines below:
 * rendered per request against the live database, never at build, because the
 * build container cannot reach the database and stock changes hourly, not
 * once a deploy.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Without the Business Profile store code every row would be rejected, so
  // there is no feed to serve rather than one Merchant Center refuses.
  const storeCode = localStoreCode();
  if (!storeCode) {
    return new Response("Local inventory feed not configured\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const tsv = await buildLocalInventoryFeed(storeCode);

  return new Response(tsv, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
