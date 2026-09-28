import type {
  HdctoolEshopContent,
  HdctoolEshopQandA,
  HdctoolEshopTerm,
  HdctoolLocalized,
} from "@/lib/hdctool/client";
import type { Locale } from "@/i18n/routing";
import { hasText, htmlToText, sanitizeHtml } from "@/lib/content/sanitize-html";

/**
 * Which HDCtool text feeds which page — pure, so the mapping is tested with a
 * fixture of the documented response shape rather than with the live API.
 *
 *   /oroi-chrisis        terms-of-use
 *   /epistrofes          return-policy
 *   /aporrito            personal-data-protection-policy
 *   /aporrito#cookies    cookie-policy-*   (the slug carries the old domain)
 *   /syxnes-erotiseis    every Q&A, in HDCtool's order
 */
export type TermKey = "terms" | "returns" | "privacy" | "cookies";

const MATCH: Record<TermKey, (slug: string) => boolean> = {
  terms: (slug) => slug === "terms-of-use",
  returns: (slug) => slug === "return-policy",
  privacy: (slug) => slug === "personal-data-protection-policy",
  cookies: (slug) => slug.startsWith("cookie-policy"),
};

export function findTerm(terms: HdctoolEshopTerm[], key: TermKey): HdctoolEshopTerm | null {
  return terms.find((t) => MATCH[key]((t.slug ?? "").trim().toLowerCase())) ?? null;
}

/**
 * The page language's text, or the Greek when that one is empty. `fallback`
 * says the Greek was used on an English or Italian page, so the page can say
 * so ("Available in Greek").
 */
export function pickLocale(
  field: Partial<HdctoolLocalized> | null | undefined,
  locale: Locale,
): { value: string; fallback: boolean } {
  const own = field?.[locale] ?? "";
  if (hasText(own)) return { value: own, fallback: false };
  return { value: field?.el ?? "", fallback: locale !== "el" };
}

export type TermView = {
  title: string;
  /** Sanitized HTML, safe to print. */
  html: string;
  updatedAt: string | null;
  /** Greek text on an English/Italian page. */
  fallback: boolean;
};

/** A term ready to render, or null when it is missing or empty. */
export function termView(term: HdctoolEshopTerm | null, locale: Locale): TermView | null {
  if (!term) return null;
  const content = pickLocale(term.content, locale);
  const html = sanitizeHtml(content.value);
  if (!htmlToText(html)) return null;
  const title = pickLocale(term.title, locale);
  return {
    title: htmlToText(sanitizeHtml(title.value)),
    html,
    updatedAt: term.updatedAt || null,
    fallback: content.fallback,
  };
}

export type FaqItemView = {
  id: string;
  question: string;
  /** Sanitized HTML. */
  answerHtml: string;
  /** Plain text, for the FAQPage JSON-LD. */
  answerText: string;
  fallback: boolean;
};

/** The Q&A in HDCtool's order, empty ones dropped. */
export function faqView(qanda: HdctoolEshopQandA[], locale: Locale): FaqItemView[] {
  return [...qanda]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item, index) => {
      const question = pickLocale(item.question, locale);
      const answer = pickLocale(item.answer, locale);
      const answerHtml = sanitizeHtml(answer.value);
      return {
        id: (item.slug ?? "").replace(/[^a-z0-9-]/gi, "") || `q${index + 1}`,
        question: htmlToText(sanitizeHtml(question.value)),
        answerHtml,
        answerText: htmlToText(answerHtml),
        fallback: question.fallback || answer.fallback,
      };
    })
    .filter((item) => item.question && item.answerText);
}

/** The documented shape, checked before anything is cached. */
export function isEshopContent(value: unknown): value is HdctoolEshopContent {
  const v = value as HdctoolEshopContent | null;
  return !!v && v.success === true && Array.isArray(v.terms) && Array.isArray(v.qanda);
}
