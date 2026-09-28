import "server-only";
import { sharedCatalogue } from "@/lib/catalog/shared-cache";
import { isEshopContent } from "@/lib/content/eshop-content-map";
import { hdctool, type HdctoolEshopContent } from "@/lib/hdctool/client";

/**
 * Terms, privacy, returns, cookies and FAQ for the HDC, from HDCtool.
 *
 * One hour, shared across requests. A failure THROWS inside the cached
 * function, so it is not cached: while the endpoint is missing (404), refuses
 * the key (401) or is slow (5s timeout), every request asks again and the page
 * renders its "coming soon" notice — never another shop's text.
 */
const load = sharedCatalogue("hdctool-eshop-content-hdc", 3600, async () => {
  const response = await hdctool.eshopContent("hdc");
  if (!isEshopContent(response)) throw new Error("eshop-content: unexpected response");
  return { terms: response.terms, qanda: response.qanda };
});

/** Never throws: null when HDCtool cannot give the content right now. */
export async function getEshopContent(): Promise<Pick<HdctoolEshopContent, "terms" | "qanda"> | null> {
  try {
    return await load();
  } catch (error) {
    console.warn("[hdc] eshop content unavailable:", (error as Error).message.slice(0, 120));
    return null;
  }
}
