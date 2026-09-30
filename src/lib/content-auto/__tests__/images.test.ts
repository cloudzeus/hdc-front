import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HERO, heroFromPhoto, heroPath, insertInlineImages, onWhite, pickHeroPhoto, type InlineCandidate } from "@/lib/content-auto/images";

const candidates: InlineCandidate[] = [
  { code: "4933479860", mentions: ["M18 FPD3-502X", "4933479860"], url: "https://cdn.test/kit.webp", alt: "Δραπανοκατσάβιδο Milwaukee M18 FPD3-502X" },
  { code: "4933479859", mentions: ["M18 FPD3-0X", "4933479859"], url: "https://cdn.test/bare.webp", alt: "Δραπανοκατσάβιδο [Milwaukee] M18 FPD3-0X" },
  { code: "4933000001", mentions: ["M18 FID3-0X"], url: "https://cdn.test/fid.webp", alt: "Παλμικό M18 FID3-0X" },
];

describe("insertInlineImages", () => {
  it("puts each photo after the first paragraph that names the product", () => {
    const body = [
      "## Ποιες εκδόσεις υπάρχουν;",
      "Το m18 fpd3-502x είναι το κιτ.",
      "| Έκδοση | Κιτ |\n|---|---|\n| M18 FPD3-0X | όχι |",
      "Το M18 FPD3-0X είναι σκέτο.",
      "Ξανά το M18 FPD3-502X.",
    ].join("\n\n");
    const { body: out, placed } = insertInlineImages(body, candidates);
    expect(placed).toEqual(["4933479860", "4933479859"]);
    const blocks = out.split("\n\n");
    expect(blocks[2]).toBe("![Δραπανοκατσάβιδο Milwaukee M18 FPD3-502X](https://cdn.test/kit.webp)");
    // Not after the table that names the bare tool: after the paragraph.
    expect(blocks[3].startsWith("|")).toBe(true);
    expect(blocks[5]).toBe("![Δραπανοκατσάβιδο Milwaukee M18 FPD3-0X](https://cdn.test/bare.webp)");
    expect(out.match(/!\[/g)).toHaveLength(2);
  });

  it("never after a heading, and at most three", () => {
    expect(insertInlineImages("## Το M18 FPD3-502X", candidates).placed).toEqual([]);
    const many = Array.from({ length: 5 }, (_, i) => ({ ...candidates[0], code: `c${i}`, mentions: [`X${i}`] }));
    const body = many.map((c) => `Για το ${c.mentions[0]}.`).join("\n\n");
    expect(insertInlineImages(body, many).placed).toHaveLength(3);
  });
});

describe("heroFromPhoto", () => {
  it("makes a 1600×900 WebP with the product centred on white", async () => {
    // A red square on a white 800×800 background, off-centre.
    const photo = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#ffffff" } })
      .composite([{ input: await sharp({ create: { width: 200, height: 300, channels: 3, background: "#db011c" } }).png().toBuffer(), left: 50, top: 60 }])
      .png()
      .toBuffer();
    const hero = await heroFromPhoto(photo);
    const meta = await sharp(hero).metadata();
    expect(meta).toMatchObject({ format: "webp", width: HERO.width, height: HERO.height });
    const { data, info } = await sharp(hero).raw().toBuffer({ resolveWithObject: true });
    const green = (x: number, y: number) => data[(y * info.width + x) * info.channels + 1];
    expect(green(800, 450)).toBeLessThan(80); // centre: the red product
    expect(green(20, 20)).toBeGreaterThan(240); // corner: white
  });

  it("stores the hero under eshop/content/<slug>/, never eshop/eshop/", () => {
    expect(heroPath("m18-fpd3")).toBe("eshop/content/m18-fpd3/hero.webp");
  });
});

const square = (background: string, product = "#db011c") =>
  sharp({ create: { width: 400, height: 400, channels: 3, background } })
    .composite([{ input: Buffer.from(`<svg width="200" height="200"><rect width="200" height="200" fill="${product}"/></svg>`), left: 100, top: 100 }])
    .png()
    .toBuffer();

describe("the hero's photo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("knows a packshot from a workshop photo", async () => {
    expect(await onWhite(await square("#ffffff"))).toBe(true);
    expect(await onWhite(await square("#556677"))).toBe(false);
  });

  it("prefers a packshot, else the first photo that downloads, and only our CDN", async () => {
    process.env.BUNNY_CDN_HOSTNAME = "cdn.test";
    const photos: Record<string, Buffer> = {
      "https://cdn.test/workshop.webp": await square("#556677"),
      "https://cdn.test/packshot.webp": await square("#ffffff"),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (photos[url] ? new Response(new Uint8Array(photos[url])) : new Response("no", { status: 404 }))),
    );
    const pick = await pickHeroPhoto([
      { code: "a", url: "https://elsewhere.test/x.webp" },
      { code: "b", url: "https://cdn.test/missing.webp" },
      { code: "c", url: "https://cdn.test/workshop.webp" },
      { code: "d", url: "https://cdn.test/packshot.webp" },
    ]);
    expect(pick?.code).toBe("d");
    const fallback = await pickHeroPhoto([{ code: "c", url: "https://cdn.test/workshop.webp" }]);
    expect(fallback?.code).toBe("c");
    expect(await pickHeroPhoto([{ code: "b", url: "https://cdn.test/missing.webp" }])).toBeNull();
  });
});
