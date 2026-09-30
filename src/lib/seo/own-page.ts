import "server-only";
import { siteOrigin } from "@/lib/seo/urls";

/**
 * Fetch one page of THIS shop, for the admin's JSON-LD check.
 *
 * The address is built from the server itself (`http://127.0.0.1:$PORT`, or
 * the configured site origin), never from request headers: a Host header an
 * attacker controls must not turn the check into a way to make the server
 * fetch other machines. Only a path is accepted, the result must stay on that
 * origin, redirects are reported and not followed, and at most 2MB is read.
 */

const MAX_BYTES = 2 * 1024 * 1024;

export type OwnPage =
  | { ok: true; url: string; status: number; location: string | null; html: string; truncated: boolean }
  | { ok: false; error: string };

export function ownOrigin(env: Record<string, string | undefined> = process.env): string {
  const port = env.PORT?.trim();
  return port && /^\d{2,5}$/.test(port) ? `http://127.0.0.1:${port}` : siteOrigin();
}

/** A path of this shop, as a URL on `origin` — or null for anything else. */
export function ownUrl(path: string, origin: string): URL | null {
  const clean = path.trim();
  if (!clean.startsWith("/") || /^\/[/\\]/.test(clean) || clean.includes("\\") || clean.length > 512) return null;
  try {
    const url = new URL(clean, origin);
    return url.origin === new URL(origin).origin ? url : null;
  } catch {
    return null;
  }
}

export async function fetchOwnPage(path: string): Promise<OwnPage> {
  const url = ownUrl(path, ownOrigin());
  if (!url) return { ok: false, error: "Γράψτε μια διαδρομή του καταστήματος, π.χ. /proion/…" };
  try {
    const response = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(20_000) });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      return { ok: true, url: url.href, status: response.status, location, html: "", truncated: false };
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    return { ok: true, url: url.href, status: response.status, location, html, truncated };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Η σελίδα δεν απάντησε." };
  }
}
