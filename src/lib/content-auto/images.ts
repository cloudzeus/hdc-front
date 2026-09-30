import "server-only";
import sharp from "sharp";
import { uploadToBunny } from "@/lib/media/bunny";
import { allowedImage } from "@/lib/seo/markdown";

/**
 * The pictures of an automatic article (spec §8). Real catalogue photos only,
 * never an AI image.
 *
 *   hero    the representative product's photo, trimmed and centred on white
 *           1600×900, WebP, at eshop/content/<slug>/hero.webp — where the
 *           heroes of the hand-written articles are
 *   inline  1–3 catalogue photos of products the text discusses, each after
 *           the first paragraph that names the product; never inside a table,
 *           a heading or the FAQ (which is not in the body at all)
 */

export const HERO = { width: 1600, height: 900 } as const;
/** The product fills at most this much of the frame, so it breathes. */
const FILL = { width: 1360, height: 765 } as const;

export async function heroFromPhoto(input: Buffer): Promise<Buffer> {
  const white = { r: 255, g: 255, b: 255, alpha: 1 };
  const trimmed = await sharp(input).rotate().flatten({ background: white }).trim({ threshold: 12 }).toBuffer();
  const product = await sharp(trimmed).resize(FILL.width, FILL.height, { fit: "inside" }).toBuffer();
  const meta = await sharp(product).metadata();
  const w = meta.width ?? FILL.width;
  const h = meta.height ?? FILL.height;
  return sharp({ create: { width: HERO.width, height: HERO.height, channels: 3, background: white } })
    .composite([{ input: product, left: Math.round((HERO.width - w) / 2), top: Math.round((HERO.height - h) / 2) }])
    .webp({ quality: 86, effort: 4 })
    .toBuffer();
}

/** `uploadToBunny` takes the full storage path: the `eshop/` prefix is written here once. */
export function heroPath(slug: string): string {
  return `eshop/content/${slug}/hero.webp`;
}

/** A catalogue photo, from our CDN only. */
export async function fetchPhoto(url: string): Promise<Buffer> {
  if (!allowedImage(url)) throw new Error(`Η φωτογραφία δεν είναι στο CDN του καταστήματος: ${url}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Η φωτογραφία δεν κατέβηκε (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Is it a packshot — the product on a white (or transparent) background? The
 * four corners decide. A workshop photo would come out as a picture with
 * white bars, so a packshot is preferred for the hero when there is one.
 */
export async function onWhite(photo: Buffer): Promise<boolean> {
  const { data, info } = await sharp(photo)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(64, 64, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const corner = (x0: number, y0: number) => {
    let min = 255;
    for (let y = y0; y < y0 + 6; y++) {
      for (let x = x0; x < x0 + 6; x++) {
        for (let c = 0; c < 3; c++) min = Math.min(min, data[(y * info.width + x) * info.channels + c]);
      }
    }
    return min;
  };
  return [corner(0, 0), corner(58, 0), corner(0, 58), corner(58, 58)].every((v) => v >= 235);
}

export type HeroPick = { code: string; url: string; photo: Buffer };

/**
 * The hero's photo: the first candidate that is a packshot, else the first
 * that downloads. Candidates in order of preference, at most `max` fetched.
 */
export async function pickHeroPhoto(candidates: Array<{ code: string; url: string }>, max = 4): Promise<HeroPick | null> {
  let first: HeroPick | null = null;
  for (const c of candidates.slice(0, max)) {
    try {
      const photo = await fetchPhoto(c.url);
      if (await onWhite(photo)) return { ...c, photo };
      first ??= { ...c, photo };
    } catch {
      /* the next one */
    }
  }
  return first;
}

/** Make the hero from a photo and upload it; returns its URL. */
export async function uploadHero(slug: string, photo: Buffer): Promise<string> {
  return uploadToBunny(await heroFromPhoto(photo), heroPath(slug));
}

// ── Inline images ───────────────────────────────────────────────────────────

export type InlineCandidate = {
  code: string;
  /** How the text may name the product: «M18 FPD3-502X», «4933479860». */
  mentions: string[];
  url: string;
  alt: string;
};

const escapeMd = (s: string) => s.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
/** Blocks after which a picture may not go. */
const NOT_AFTER = /^(#{1,6}\s|\||```|!\[)/;

/**
 * Put up to `max` photos into the body, each after the first paragraph (or
 * list) that names its product, one per product and one per paragraph.
 */
export function insertInlineImages(body: string, candidates: InlineCandidate[], max = 3): { body: string; placed: string[] } {
  const blocks = body.split(/\n{2,}/);
  const placed: string[] = [];
  const out: string[] = [];
  const norm = (s: string) => s.toUpperCase().replace(/\s+/g, " ");
  for (const block of blocks) {
    out.push(block);
    if (placed.length >= max || NOT_AFTER.test(block.trim())) continue;
    const text = norm(block);
    const hit = candidates.find((c) => !placed.includes(c.code) && c.mentions.some((m) => m && text.includes(norm(m))));
    if (!hit) continue;
    out.push(`![${escapeMd(hit.alt)}](${hit.url})`);
    placed.push(hit.code);
  }
  return { body: out.join("\n\n"), placed };
}
