import { parse as parseYaml } from "yaml";
import type { FaqPair } from "@/lib/seo/product-faq";

/**
 * The drafted content in docs/content/**, read as data.
 *
 * The files are Markdown with YAML front matter (articles, guides, platform
 * hubs) or JSON (category intros); see docs/content/news/README.md and
 * docs/content/seo/README.md. Only the Greek files are read: SEO targets the
 * Greek market only (owner decision, 30/9/2026).
 *
 * The body is split the way the pages render it, so that nothing is said
 * twice: the opening «Σύντομη απάντηση» paragraph becomes `answer` (hubs:
 * `intro`), and the «Συχνές ερωτήσεις» section becomes `faq` — rendered from
 * that one field and emitted as `FAQPage` from the same pairs.
 *
 * Pure: no file system, no database. `scripts/content/import-content.ts` does
 * the reading and writing.
 */

export type ArticleDraft = {
  kind: "ARTICLE" | "GUIDE";
  slug: string;
  title: string;
  seoTitle: string | null;
  metaDescription: string | null;
  answer: string | null;
  body: string;
  faq: FaqPair[];
  keywords: string[];
  entities: string[];
  sources: string[];
};

export type OverrideDraft = {
  targetType: "PLATFORM" | "CATEGORY";
  targetKey: string;
  h1: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
  intro: string | null;
  body: string | null;
  faq: FaqPair[];
  keywords: string[];
  entities: string[];
  sources: string[];
  relatedArticles: string[];
  relatedCategories: string[];
};

const FRONT_MATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function splitFrontMatter(text: string): { data: Record<string, unknown>; body: string } {
  const match = FRONT_MATTER.exec(text);
  if (!match) return { data: {}, body: text };
  let data: unknown;
  try {
    data = parseYaml(match[1]);
  } catch {
    return { data: {}, body: text };
  }
  return {
    data: data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {},
    body: text.slice(match[0].length).replace(/^\s+/, ""),
  };
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(str).filter((s): s is string => s != null) : [];

function faqPairs(value: unknown): FaqPair[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const q = str((item as { q?: unknown })?.q);
      const a = str((item as { a?: unknown })?.a);
      return q && a ? { q, a } : null;
    })
    .filter((p): p is FaqPair => p != null);
}

/** Lines of one paragraph joined into one line: Markdown's soft wrap. */
const joinLines = (paragraph: string) => paragraph.split(/\r?\n/).map((l) => l.trim()).join(" ").trim();

/** A Markdown block that is not prose: heading, list, table, quote, code, rule. */
const NOT_PROSE = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>|```|---|\*\*\*)/;

/**
 * The first paragraph as the direct answer, with a «Σύντομη απάντηση:» label
 * (bold or not) taken off. Null when the body does not open with prose.
 */
export function splitLead(body: string): { lead: string | null; rest: string } {
  const text = body.replace(/^\s+/, "");
  const end = text.search(/\r?\n\s*\r?\n/);
  const first = end < 0 ? text : text.slice(0, end);
  if (!first.trim() || NOT_PROSE.test(first.trim())) return { lead: null, rest: text.trim() };
  const lead = joinLines(first)
    .replace(/^\*\*\s*Σύντομη απάντηση\s*:?\s*\*\*\s*:?\s*/i, "")
    .replace(/^Σύντομη απάντηση\s*:\s*/i, "")
    .trim();
  return { lead: lead || null, rest: (end < 0 ? "" : text.slice(end)).trim() };
}

const FAQ_HEADING = /^##\s+(Συχνές ερωτήσεις|Συχνές Ερωτήσεις|FAQ)\s*$/m;

/**
 * The «Συχνές ερωτήσεις» H2 section, lifted out: `### question` followed by
 * its answer paragraph(s), up to the next H2 or the end.
 */
export function stripFaqSection(body: string): { body: string; faq: FaqPair[] } {
  const heading = FAQ_HEADING.exec(body);
  if (!heading) return { body: body.trim(), faq: [] };
  const start = heading.index;
  const afterHeading = start + heading[0].length;
  const nextH2 = body.slice(afterHeading).search(/^##\s/m);
  const end = nextH2 < 0 ? body.length : afterHeading + nextH2;
  const section = body.slice(afterHeading, end);

  const faq: FaqPair[] = [];
  for (const block of section.split(/^###\s+/m).slice(1)) {
    const newline = block.indexOf("\n");
    const q = (newline < 0 ? block : block.slice(0, newline)).trim();
    const a = joinLines(
      (newline < 0 ? "" : block.slice(newline))
        .trim()
        .split(/\r?\n\s*\r?\n/)
        .join("\n"),
    );
    if (q && a) faq.push({ q, a });
  }

  const rest = `${body.slice(0, start).trimEnd()}\n\n${body.slice(end).trimStart()}`.trim();
  return { body: rest, faq };
}

/** A news article or guide (el.md). Null when it is not a usable Greek file. */
export function parseArticleFile(text: string, kind: ArticleDraft["kind"]): ArticleDraft | null {
  const { data, body } = splitFrontMatter(text);
  const lang = str(data.lang);
  const slug = str(data.slug);
  const title = str(data.title);
  if ((lang && lang !== "el") || !slug || !title) return null;

  const { lead, rest } = splitLead(body);
  const { body: withoutFaq, faq: bodyFaq } = stripFaqSection(rest);
  const faq = faqPairs(data.faq);

  return {
    kind,
    slug,
    title,
    seoTitle: str(data.seoTitle),
    metaDescription: str(data.metaDescription),
    answer: lead,
    body: withoutFaq,
    faq: faq.length ? faq : bodyFaq,
    keywords: strings(data.keywords),
    entities: [...new Set([...strings(data.entities), ...strings(data.about)])],
    sources: strings(data.sources),
  };
}

/** A platform hub (seo/platforms/<key>/el.md) → a PLATFORM override. */
export function parsePlatformFile(text: string): OverrideDraft | null {
  const { data, body } = splitFrontMatter(text);
  const key = str(data.key);
  const lang = str(data.lang);
  if (!key || (lang && lang !== "el")) return null;

  const { lead, rest } = splitLead(body);
  const { body: withoutFaq, faq: bodyFaq } = stripFaqSection(rest);
  const faq = faqPairs(data.faq);

  return {
    targetType: "PLATFORM",
    targetKey: key,
    h1: str(data.h1),
    seoTitle: str(data.seoTitle),
    metaDescription: str(data.metaDescription),
    intro: lead,
    body: withoutFaq || null,
    faq: faq.length ? faq : bodyFaq,
    keywords: strings(data.keywords),
    entities: strings(data.entities),
    sources: strings(data.sources),
    relatedArticles: strings(data.relatedArticles),
    relatedCategories: [],
  };
}

/** A category intro (seo/categories/<slug>.json, its `el` block) → a CATEGORY override. */
export function parseCategoryFile(text: string): OverrideDraft | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const slug = str(data?.slug);
  const el = data?.el as Record<string, unknown> | undefined;
  if (!slug || !el || typeof el !== "object") return null;

  return {
    targetType: "CATEGORY",
    targetKey: slug,
    h1: str(el.h1),
    seoTitle: str(el.seoTitle),
    metaDescription: str(el.metaDescription),
    intro: str(el.intro),
    body: null,
    faq: faqPairs(el.faq),
    keywords: strings(el.keywords),
    entities: strings(el.entities),
    sources: strings(data.sources ?? el.sources),
    relatedArticles: strings(el.relatedArticles),
    relatedCategories: strings(el.relatedCategories),
  };
}
