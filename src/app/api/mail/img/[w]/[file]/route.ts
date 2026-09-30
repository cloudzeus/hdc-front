import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { decodeMailImage, isMailImageWidth } from "@/lib/mail/hdc/image";

/**
 * Catalogue pictures for email, as JPEG (lib/mail/hdc/image.ts explains why).
 *
 *   /api/mail/img/{144|340|600}/{base64url of the CDN address}.jpg
 *
 * Only addresses on the shop's own CDNs are fetched — anything else is a 404,
 * so this is not an open proxy. Each picture is converted once per container
 * and kept on disk; after that it is a file read. Mail clients and their image
 * proxies cache it for a year (the address never changes for new content: a
 * new picture has a new CDN address).
 *
 * Conversions are few and small (a 1280px WebP down to at most 600px), but
 * sharp runs on the same thread pool as the rest of the server, so they are
 * limited to two at a time and the same picture is never converted twice in
 * parallel.
 */

const CACHE_DIR = path.join(os.tmpdir(), "hdc-mail-img");
const MAX_BYTES = 10 * 1024 * 1024;
const HEADERS = {
  "Content-Type": "image/jpeg",
  "Cache-Control": "public, max-age=31536000, immutable",
};

const inflight = new Map<string, Promise<Buffer | null>>();
let running = 0;
const waiting: Array<() => void> = [];

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await work();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

async function convert(source: string, width: number): Promise<Buffer | null> {
  const upstream = await fetch(source, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!upstream.ok) return null;
  if (!(upstream.headers.get("content-type") ?? "").startsWith("image/")) return null;
  const input = Buffer.from(await upstream.arrayBuffer());
  if (input.byteLength > MAX_BYTES) return null;
  return slot(() =>
    sharp(input)
      .resize({ width, withoutEnlargement: true })
      // Transparent product cut-outs sit on white, as on the card.
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer(),
  );
}

async function picture(source: string, width: number): Promise<Buffer | null> {
  const key = createHash("sha256").update(`${width}:${source}`).digest("hex");
  const file = path.join(CACHE_DIR, `${key}.jpg`);
  try {
    return await readFile(file);
  } catch {
    // Not cached yet.
  }
  let pending = inflight.get(key);
  if (!pending) {
    pending = convert(source, width)
      .then(async (jpeg) => {
        if (jpeg) {
          await mkdir(CACHE_DIR, { recursive: true });
          await writeFile(file, jpeg).catch(() => undefined);
        }
        return jpeg;
      })
      .catch((error) => {
        console.warn("[mail-img] conversion failed", source, error instanceof Error ? error.message : error);
        return null;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ w: string; file: string }> },
) {
  const { w, file } = await params;
  const width = Number(w);
  const source = decodeMailImage(file);
  if (!isMailImageWidth(width) || !source) return new Response("not found", { status: 404 });

  const jpeg = await picture(source, width);
  if (!jpeg) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(jpeg), { headers: HEADERS });
}
