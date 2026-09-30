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

/** Fetch a catalogue photo (our CDN only), make the hero, upload it; returns its URL. */
export async function uploadHero(slug: string, photoUrl: string): Promise<string> {
  if (!allowedImage(photoUrl)) throw new Error(`Η φωτογραφία δεν είναι στο CDN του καταστήματος: ${photoUrl}`);
  const response = await fetch(photoUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Η φωτογραφία δεν κατέβηκε (${response.status})`);
  const hero = await heroFromPhoto(Buffer.from(await response.arrayBuffer()));
  return uploadToBunny(hero, heroPath(slug));
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
