import { Marked, type Tokens } from "marked";

/**
 * Markdown → HTML for the articles, guides and hub pages stored in the
 * database (`ContentArticle.body`, `SeoOverride.body`).
 *
 * The writers are staff, but the page must not be the only place that trusts
 * them: raw HTML in the Markdown is shown as text, never parsed, a link may
 * only point at http(s), mailto, tel, a path or an anchor — a `javascript:`
 * URL renders as plain text — and an image only at our CDN. Links to other sites open in a new
 * tab without handing them the opener. Tables are wrapped so a wide one scrolls
 * inside its box on a phone instead of widening the page.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

const isExternal = (href: string) => /^https?:\/\//i.test(href);

/**
 * The hosts an inline image may come from: our CDN (BUNNY_CDN_HOSTNAME, the
 * pull zone the admin uploads to and the articles' images live on). An image
 * anywhere else is dropped to its alt text — the article must not become a
 * way to hot-link, or to track readers from, somebody else's server.
 */
function imageHosts(): Set<string> {
  const host = process.env.BUNNY_CDN_HOSTNAME?.trim().toLowerCase();
  return new Set(host ? [host] : []);
}

function allowedImage(href: string, hosts: Set<string>): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "https:" && hosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const imageHtml = (token: Tokens.Image) =>
  `<img src="${escapeHtml(token.href.trim())}" alt="${escapeHtml(token.text)}" loading="lazy" decoding="async">`;

function createMarked(hosts: Set<string>) {
  return new Marked({
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
        return allowedImage(token.href.trim(), hosts) ? imageHtml(token) : escapeHtml(token.text);
      },
      /* A paragraph that is only an image is a figure, captioned by the image's title. */
      paragraph(this: { parser: { parseInline: (tokens: Tokens.Generic[]) => string } }, token: Tokens.Paragraph) {
        const only = token.tokens.length === 1 && token.tokens[0].type === "image" ? (token.tokens[0] as Tokens.Image) : null;
        if (only && allowedImage(only.href.trim(), hosts)) {
          const caption = only.title ? `<figcaption>${escapeHtml(only.title)}</figcaption>` : "";
          return `<figure class="md-figure">${imageHtml(only)}${caption}</figure>\n`;
        }
        return `<p>${this.parser.parseInline(token.tokens)}</p>\n`;
      },
    },
  });
}

export function renderMarkdown(markdown: string | null | undefined, options: { imageHosts?: string[] } = {}): string {
  if (!markdown?.trim()) return "";
  const hosts = options.imageHosts ? new Set(options.imageHosts.map((h) => h.toLowerCase())) : imageHosts();
  const html = createMarked(hosts).parse(markdown, { async: false }) as string;
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
