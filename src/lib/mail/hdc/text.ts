/**
 * The plain-text part of an email, from its own HTML.
 *
 * Derived rather than written by hand, so it is always in the reader's
 * language and never says something the HTML does not. Spam filters score an
 * HTML-only message worse, and some clients show only this part.
 *
 * Regions wrapped in `<!--text:skip-->…<!--/text:skip-->` (the hidden
 * preheader, the header menu) are left out. Links keep their address, except
 * phone and mail links, whose text already says it.
 */

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rarr: "→",
  larr: "←",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  ndash: "–",
  mdash: "—",
};

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--text:skip-->[\s\S]*?<!--\/text:skip-->/g, "");
  s = s.replace(/<head[\s\S]*?<\/head>/i, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<img[^>]*>/gi, "");

  // Links: «label (address)»; tel:/mailto: only their label.
  s = s.replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) => {
    const label = decode(inner.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    const url = decode(href);
    if (!label) return ""; // a picture link (the logo) says nothing in text
    if (!url || /^(tel|mailto):/i.test(url) || url === label) return label;
    return label ? `${label} (${url})` : url;
  });

  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|tr|h[1-6]|div|table|li)>/gi, "\n");
  s = s.replace(/<\/td>/gi, "  ");
  s = s.replace(/<[^>]+>/g, "");
  s = decode(s);
  // Invisible padding characters used after the preheader.
  s = s.replace(/[\u2007\uFEFF\u034F\u200B]/g, "");

  return s
    .split("\n")
    // Runs of spaces collapse; a non-breaking space (inside amounts, «1.092,89 €») stays.
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
