/**
 * Product and banner pictures in email: JPEG, never WebP.
 *
 * The whole catalogue is WebP on the Bunny CDN and the pull zone has no
 * optimizer: `?format=jpeg`, `?format=jpg&width=340` and `?width=` all come
 * back as the same `image/webp` (checked with curl, 30/9/2026), and there is no
 * JPEG next to the WebP. Outlook for Windows renders with Word and shows a
 * broken-image box instead of a WebP.
 *
 * So the email points at our own `/api/mail/img/{width}/{source}.jpg`, which
 * fetches the picture from an allowed CDN, scales it down and answers a JPEG
 * on white, cached for a year (app/api/mail/img). The address is absolute and
 * public, like the CDN's, and every client can show it.
 *
 * A WebP from a host we do not proxy is dropped (the card keeps its white box):
 * an empty frame is better than a broken icon in a customer's inbox.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** The only widths the route answers — @2x of the 72px line, 170px card and 300px hero. */
export const MAIL_IMAGE_WIDTHS = [144, 340, 600] as const;
export type MailImageWidth = (typeof MAIL_IMAGE_WIDTHS)[number];

const STATIC_HOSTS = ["kolleris.b-cdn.net", "cdn.kolleris.com", "static.synfiles.gr", "hdctool.wwa.gr"];

/** CDN hosts the route may fetch from. Never an arbitrary URL: that would be an open proxy. */
export function isAllowedImageHost(host: string): boolean {
  const own = process.env.BUNNY_CDN_HOSTNAME?.trim().toLowerCase();
  const h = host.toLowerCase();
  return STATIC_HOSTS.includes(h) || (!!own && h === own);
}

function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

/**
 * Only addresses WE wrote into an email are served: each carries an HMAC of
 * its width and source, keyed with a server secret (never printed). Without
 * it anyone could make the server fetch and convert any CDN picture at any
 * width, over and over.
 */
function secret(): string {
  return process.env.MAIL_IMAGE_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || "";
}

function sign(width: number, source: string): string | null {
  const key = secret();
  if (!key) return null;
  return createHmac("sha256", key).update(`mail-img:${width}:${source}`).digest("base64url").slice(0, 22);
}

/**
 * A plain CDN file address: https, an allowed host, no port, no credentials,
 * no query, no fragment.
 */
function cleanSource(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !isAllowedImageHost(url.hostname)) return null;
  if (url.port || url.username || url.password || url.search || url.hash) return null;
  return url;
}

/** The source URL inside `{base64url}.{signature}.jpg`, or null when it is not one we signed. */
export function decodeMailImage(file: string, width: number): string | null {
  const match = /^([A-Za-z0-9_-]{8,2048})\.([A-Za-z0-9_-]{22})\.jpg$/.exec(file);
  if (!match) return null;
  const url = cleanSource(Buffer.from(match[1], "base64url").toString("utf8"));
  if (!url) return null;
  const expected = sign(width, url.href);
  if (!expected) return null;
  const a = Buffer.from(expected);
  const b = Buffer.from(match[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return url.href;
}

export function isMailImageWidth(value: number): value is MailImageWidth {
  return (MAIL_IMAGE_WIDTHS as readonly number[]).includes(value);
}

/**
 * The address an email uses for a picture.
 *
 * `origin` is where the route is served: the public site for real sends, the
 * current host for an admin preview.
 */
export function mailImageUrl(src: string | null | undefined, width: MailImageWidth, origin: string): string {
  if (!src) return "";
  let url: URL;
  try {
    // `new URL` also encodes the spaces some catalogue file names carry.
    url = new URL(src);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (url.protocol === "https:" && isAllowedImageHost(url.hostname)) {
    const clean = cleanSource(url.href);
    const signature = clean ? sign(width, clean.href) : null;
    // Unsignable (odd address, or no secret configured): no picture rather than a broken one.
    if (!clean || !signature) return "";
    return `${origin.replace(/\/$/, "")}/api/mail/img/${width}/${toBase64Url(clean.href)}.${signature}.jpg`;
  }
  if (/\.webp$/i.test(url.pathname)) return "";
  return url.href;
}
