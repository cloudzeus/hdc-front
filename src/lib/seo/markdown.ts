import { Marked, type Tokens } from "marked";

/**
 * Markdown → HTML for the articles, guides and hub pages stored in the
 * database (`ContentArticle.body`, `SeoOverride.body`).
 *
 * The writers are staff, but the page must not be the only place that trusts
 * them: raw HTML in the Markdown is shown as text, never parsed, and a link or
 * image may only point at http(s), mailto, tel, a path or an anchor — a
 * `javascript:` URL renders as plain text. Links to other sites open in a new
 * tab without handing them the opener. Tables are wrapped so a wide one scrolls
 * inside its box on a phone instead of widening the page.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

const isExternal = (href: string) => /^https?:\/\//i.test(href);

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(text);
    },
    link(this: { parser: { parseInline: (tokens: Tokens.Generic[]) => string } }, token: Tokens.Link) {
      const inner = this.parser.parseInline(token.tokens);
      const href = token.href.trim();
      if (!SAFE_URL.test(href)) return inner;
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      const external = isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<a href="${escapeHtml(href)}"${title}${external}>${inner}</a>`;
    },
    image(token: Tokens.Image) {
      const href = token.href.trim();
      if (!/^(https:\/\/|\/(?!\/))/i.test(href)) return escapeHtml(token.text);
      return `<img src="${escapeHtml(href)}" alt="${escapeHtml(token.text)}" loading="lazy">`;
    },
  },
});

export function renderMarkdown(markdown: string | null | undefined): string {
  if (!markdown?.trim()) return "";
  const html = marked.parse(markdown, { async: false }) as string;
  // Raw HTML is escaped above, so every <table> here is a Markdown table.
  return html.replace(/<table>/g, '<div class="md-table"><table>').replace(/<\/table>/g, "</table></div>");
}

/** Plain words, for reading time. */
export function wordCount(markdown: string | null | undefined): number {
  if (!markdown) return 0;
  return markdown
    .replace(/[#>*_`|[\]()-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Minutes at ~200 words a minute, at least one. */
export function readingMinutes(...texts: Array<string | null | undefined>): number {
  const words = texts.reduce((sum, t) => sum + wordCount(t), 0);
  return Math.max(1, Math.round(words / 200));
}
