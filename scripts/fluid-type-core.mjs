/**
 * Fluid type tokens: the pure part of scripts/fluid-type.mjs.
 *
 * One token per font size. The desktop value is the size in the mockup (so a
 * 1280px screen is pixel-identical to the design); the phone value follows the
 * house rule, and the browser interpolates linearly between a 360px phone and a
 * 1280px desktop with clamp().
 *
 *   d < 16        phone = d + 1        small UI text grows on a phone
 *   16 <= d < 22  phone = d            body sizes stay put
 *   d >= 22       phone = d * 0.78     headings shrink to fit 360px
 */

export const PHONE_VW = 360;
export const DESKTOP_VW = 1280;

const round = (n, places) => {
  const f = 10 ** places;
  // `+ 0` turns -0 into 0 so a flat token prints "0vw", not "-0vw".
  return Math.round(n * f) / f + 0;
};

/** Phone size in px for a desktop size in px. */
export function phoneSize(d) {
  if (d < 16) return d + 1;
  if (d < 22) return d;
  // Two decimals only to drop float noise (64 * 0.78 = 49.920000000000002).
  return round(d * 0.78, 2);
}

/** `13.5` -> `--fs-13-5`. */
export function tokenName(d) {
  return `--fs-${String(d).replace(".", "-")}`;
}

/**
 * The clamp() for one desktop size.
 *
 * Returns the numbers too, so a test can check the maths rather than the
 * string. `min` is always the smaller bound and `max` the larger, whichever way
 * the size moves between phone and desktop.
 */
export function fluidToken(d) {
  const m = phoneSize(d);
  const slope = (d - m) / (DESKTOP_VW - PHONE_VW); // px per px of viewport
  const intercept = m - slope * PHONE_VW; // px at a 0px viewport

  const minRem = round(Math.min(m, d) / 16, 4);
  const maxRem = round(Math.max(m, d) / 16, 4);
  const interceptRem = round(intercept / 16, 4);
  const slopeVw = round(slope * 100, 4);

  const sign = slopeVw < 0 ? "-" : "+";
  const value = `clamp(${minRem}rem, ${interceptRem}rem ${sign} ${Math.abs(slopeVw)}vw, ${maxRem}rem)`;

  return { name: tokenName(d), d, m, slope, intercept, minRem, maxRem, interceptRem, slopeVw, value };
}

/**
 * Every px font size in a chunk of CSS: `font-size: 13px` and the size inside a
 * `font:` shorthand (`font: semi-condensed 600 11px/1.35 "TikTok Sans"`).
 */
export function extractFontSizes(css) {
  const sizes = new Set();
  for (const m of css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) {
    sizes.add(Number(m[1]));
  }
  // `font:` itself, not `font-family:` / `--x-font:` and friends.
  for (const m of css.matchAll(/(?<![-\w])font\s*:\s*([^;}]*)/g)) {
    const size = m[1].match(/(\d+(?:\.\d+)?)px/);
    if (size) sizes.add(Number(size[1]));
  }
  return [...sizes];
}

/** The `:root { … }` block for a list of sizes, smallest first. */
export function rootBlock(sizes) {
  const sorted = [...new Set(sizes)].sort((a, b) => a - b);
  const lines = sorted.map((d) => {
    const t = fluidToken(d);
    return `  ${t.name}: ${t.value}; /* ${d}px desktop, ${t.m}px phone */`;
  });
  return `:root {\n${lines.join("\n")}\n}`;
}
