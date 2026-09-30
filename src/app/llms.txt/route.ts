import { siteOrigin } from "@/lib/seo/urls";
import { llmsTxt } from "@/lib/seo/llms";
import { getSetting } from "@/lib/settings/settings";

/**
 * llms.txt — the shop in plain sentences for language models, Greek first.
 * The text lives in `src/lib/seo/llms.ts`, where it is tested (including that
 * it never claims to represent the manufacturer); the Greek summary at the top
 * is the admin's `llms.summary.el` setting when set.
 *
 * Rendered per request (one settings read) so an edited summary shows at once;
 * crawlers are asked to cache it for an hour.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const summaryEl = await getSetting("llms.summary.el").catch(() => null);
  return new Response(llmsTxt(siteOrigin(), { summaryEl }), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
