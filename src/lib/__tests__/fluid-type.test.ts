import { describe, expect, it } from "vitest";
import {
  extractFontSizes,
  fluidToken,
  phoneSize,
  rootBlock,
  tokenName,
} from "../../../scripts/fluid-type-core.mjs";

/** The clamp's preferred value, in rem, at a given viewport width in px. */
const preferredRem = (t: ReturnType<typeof fluidToken>, viewport: number) =>
  t.interceptRem + (t.slopeVw * (viewport / 100)) / 16;

describe("fluid type tokens", () => {
  it("grows small UI text by 1px on a phone", () => {
    const t = fluidToken(14);
    expect(phoneSize(14)).toBe(15);
    expect(t.m).toBe(15);
    expect(t.minRem).toBe(0.875); // desktop 14px is the smaller bound
    expect(t.maxRem).toBe(0.9375); // phone 15px is the larger bound
    expect(t.value).toBe("clamp(0.875rem, 0.962rem - 0.1087vw, 0.9375rem)");
  });

  it("keeps body sizes constant", () => {
    const t = fluidToken(18);
    expect(t.m).toBe(18);
    expect(t.minRem).toBe(1.125);
    expect(t.maxRem).toBe(1.125);
    expect(t.slopeVw).toBe(0);
    expect(t.value).toBe("clamp(1.125rem, 1.125rem + 0vw, 1.125rem)");
  });

  it("shrinks headings to 78% on a phone", () => {
    const t = fluidToken(64);
    expect(t.m).toBe(49.92);
    expect(t.minRem).toBe(3.12);
    expect(t.maxRem).toBe(4);
  });

  it("always puts the smaller bound first", () => {
    for (const d of [9, 12, 13.5, 15, 16, 20, 21, 22, 28, 52, 92]) {
      const t = fluidToken(d);
      expect(t.minRem).toBeLessThanOrEqual(t.maxRem);
    }
  });

  it("is pixel-identical to the design at 1280px and to the phone size at 360px", () => {
    for (const d of [11, 13, 13.5, 14, 18, 22, 28, 40, 52, 64, 92]) {
      const t = fluidToken(d);
      expect(preferredRem(t, 1280)).toBeCloseTo(d / 16, 3);
      expect(preferredRem(t, 360)).toBeCloseTo(t.m / 16, 3);
    }
  });

  it("names decimals with a hyphen", () => {
    expect(tokenName(13.5)).toBe("--fs-13-5");
    expect(tokenName(14)).toBe("--fs-14");
  });

  it("reads font-size and the size inside a font shorthand", () => {
    const css = `
      .a { font-size:13px; }
      .b { font:semi-condensed 600 11px/1.35 "TikTok Sans",sans-serif; }
      .c { font-family:"TikTok Sans"; font-size: 22px }
      .d { --x-font: 99px; font-weight:800; }
    `;
    expect(extractFontSizes(css).sort((a, b) => a - b)).toEqual([11, 13, 22]);
  });

  it("prints a sorted, de-duplicated :root block", () => {
    const block = rootBlock([22, 13, 13, 18]);
    const names = [...block.matchAll(/(--fs-[\d-]+):/g)].map((m) => m[1]);
    expect(names).toEqual(["--fs-13", "--fs-18", "--fs-22"]);
    expect(block.startsWith(":root {")).toBe(true);
  });
});
