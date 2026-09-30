import { siteOrigin } from "@/lib/seo/urls";
import { llmsTxt } from "@/lib/seo/llms";

/**
 * llms.txt — the shop in plain sentences for language models. The text lives
 * in `src/lib/seo/llms.ts`, where it is tested (including that it never claims
 * to represent the manufacturer).
 */
export const runtime = "nodejs";
export const revalidate = 86400;

export async function GET() {
  return new Response(llmsTxt(siteOrigin()), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
