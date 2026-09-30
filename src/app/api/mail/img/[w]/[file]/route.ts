import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { decodeMailImage, isAllowedImageHost, isMailImageWidth } from "@/lib/mail/hdc/image";

/**
 * Catalogue pictures for email, as JPEG (lib/mail/hdc/image.ts explains why).
 *
 *   /api/mail/img/{144|340|600}/{base64url of the CDN address}.{signature}.jpg
 *
 * Only addresses the shop itself signed are served (an HMAC of width and
 * source), only from the shop's CDNs, with no redirects followed — anything
 * else is a 404, so this is neither an open proxy nor a free converter.
 *
 * The work is bounded: two conversions at a time and at most eight waiting
 * (then 503), a 10 MB cap on what is downloaded, a pixel cap on what sharp
 * decodes, and a disk cache pruned to 200 MB. Each picture is converted once
 * per container; mail clients and their proxies then cache it for a year.
 */

const CACHE_DIR = path.join(os.tmpdir(), "hdc-mail-img");
const CACHE_MAX_BYTES = 200 * 1024 * 1024;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_RUNNING = 2;
const MAX_WAITING = 8;
const HEADERS = {
  "Content-Type": "image/jpeg",
  "Cache-Control": "public, max-age=31536000, immutable",
};

class Busy extends Error {}

const inflight = new Map<string, Promise<Buffer | null>>();
let running = 0;
const waiting: Array<() => void> = [];

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_RUNNING) {
    if (waiting.length >= MAX_WAITING) throw new Busy();
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running += 1;
  try {
    return await work();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

/** The body, or null past 10 MB — checked on the header first, then while streaming. */
async function readCapped(response: Response, controller: AbortController): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    controller.abort();
    return null;
  }
  if (!response.body) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      controller.abort();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function convert(source: string, width: number): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    // No redirects: a redirect could lead anywhere, including inside our network.
    const upstream = await fetch(source, { cache: "no-store", redirect: "error", signal: controller.signal });
    if (!upstream.ok) return null;
    if (!isAllowedImageHost(new URL(upstream.url || source).hostname)) return null;
    if (!(upstream.headers.get("content-type") ?? "").startsWith("image/")) return null;
    const input = await readCapped(upstream, controller);
    if (!input) return null;
    return await sharp(input, { limitInputPixels: MAX_PIXELS })
      .resize({ width, withoutEnlargement: true })
      // Transparent product cut-outs sit on white, as on the card.
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } finally {
    clearTimeout(timer);
  }
}

/** Keep the cache under its size: the oldest files go first. Best effort. */
async function prune(): Promise<void> {
  const names = await readdir(CACHE_DIR).catch(() => [] as string[]);
  const files = (
    await Promise.all(
      names.map(async (name) => {
        const file = path.join(CACHE_DIR, name);
        const s = await stat(file).catch(() => null);
        return s?.isFile() ? { file, size: s.size, at: s.mtimeMs } : null;
      }),
    )
  ).filter((f): f is { file: string; size: number; at: number } => f !== null);
  let total = files.reduce((sum, f) => sum + f.size, 0);
  if (total <= CACHE_MAX_BYTES) return;
  for (const f of files.sort((a, b) => a.at - b.at)) {
    if (total <= CACHE_MAX_BYTES * 0.8) break;
    await unlink(f.file).catch(() => undefined);
    total -= f.size;
  }
}

/** Caching is a nicety: a failure here never costs the reader the picture. */
async function store(file: string, jpeg: Buffer): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, jpeg);
    await prune();
  } catch (error) {
    console.warn("[mail-img] cache write failed", error instanceof Error ? error.message : error);
  }
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
    // The download and the conversion both hold a slot.
    pending = slot(() => convert(source, width))
      .then(async (jpeg) => {
        if (jpeg) await store(file, jpeg);
        return jpeg;
      })
      .catch((error) => {
        if (error instanceof Busy) throw error;
        console.warn("[mail-img] conversion failed", error instanceof Error ? error.message : error);
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
  if (!isMailImageWidth(width)) return new Response("not found", { status: 404 });
  const source = decodeMailImage(file, width);
  if (!source) return new Response("not found", { status: 404 });

  try {
    const jpeg = await picture(source, width);
    if (!jpeg) return new Response("not found", { status: 404 });
    return new Response(new Uint8Array(jpeg), { headers: HEADERS });
  } catch (error) {
    if (error instanceof Busy) {
      return new Response("busy", { status: 503, headers: { "Retry-After": "5" } });
    }
    return new Response("not found", { status: 404 });
  }
}
