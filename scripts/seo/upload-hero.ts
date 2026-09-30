/**
 * Put the home hero photo on our CDN (Bunny), from a LOCAL file:
 *
 *   npx tsx --env-file=.env scripts/seo/upload-hero.ts ./hero.jpg
 *
 * Prints the CDN URL and the size to put in HERO in
 * src/app/[locale]/(home)/page.tsx. The image is resized and converted to
 * WebP by the same `uploadImage` the admin uses (src/lib/media/bunny.ts).
 * Deliberately takes a file, not a URL: the photo must be one we are
 * entitled to publish, chosen by a person.
 */
import fs from "node:fs";
import path from "node:path";
import { uploadImage } from "@/lib/media/bunny";

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error("usage: upload-hero.ts <local image file>");
    process.exitCode = 1;
    return;
  }
  const result = await uploadImage(fs.readFileSync(file), { folder: "hdc/home", name: path.basename(file) });
  console.log(JSON.stringify({ url: result.url, width: result.width, height: result.height, bytes: result.bytes }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
