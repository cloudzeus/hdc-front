import { DEALER_WORDING } from "@/lib/seo/dealer-wording";

/**
 * The live checks of the «SEO & Περιεχόμενο» editor: what a search result or
 * an assistant will cut, and what the store must never say. Pure, so the
 * editor runs them on every keystroke and the server again on save.
 *
 *   <title>            ≤ 60 characters
 *   meta description   ≤ 155
 *   short answer       40–60 words (what gets quoted whole)
 *   never              a dealer/representative claim, a price, a stock level
 */

export type CheckLevel = "error" | "warn";
export type Check = { level: CheckLevel; field: string; message: string };

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;
export const ANSWER_WORDS = { min: 40, max: 60 } as const;

/** A price: «199 €», «199,90€», «€199», «199 ευρώ». */
const PRICE = /(\d[\d.,]*\s?(€|ευρώ|eur\b))|(€\s?\d)/i;
/** A stock claim: «σε απόθεμα», «διαθέσιμα 12 τεμάχια», «τελευταίο κομμάτι». */
const STOCK = /(σε απόθεμα|απόθεμα \d|\d+ τεμάχια διαθέσιμα|τελευταίο (τεμάχιο|κομμάτι)|in stock)/i;

export const words = (text: string | null | undefined) => (text ?? "").split(/\s+/).filter(Boolean).length;

export type CheckInput = {
  title?: string | null;
  seoTitle?: string | null;
  metaDescription?: string | null;
  answer?: string | null;
  body?: string | null;
  faq?: Array<{ q: string; a: string }>;
};

export function contentChecks(input: CheckInput, options: { answerRequired?: boolean } = {}): Check[] {
  const checks: Check[] = [];
  const title = (input.seoTitle || input.title || "").trim();
  if (!title) checks.push({ level: "error", field: "title", message: "Λείπει ο τίτλος." });
  else if (title.length > TITLE_MAX) {
    checks.push({ level: "warn", field: "seoTitle", message: `Ο τίτλος για τη Google έχει ${title.length} χαρακτήρες (έως ${TITLE_MAX}).` });
  }

  const description = input.metaDescription?.trim() ?? "";
  if (!description) checks.push({ level: "warn", field: "metaDescription", message: "Λείπει η περιγραφή για τη Google." });
  else if (description.length > DESCRIPTION_MAX) {
    checks.push({
      level: "warn",
      field: "metaDescription",
      message: `Η περιγραφή έχει ${description.length} χαρακτήρες (έως ${DESCRIPTION_MAX}).`,
    });
  }

  const n = words(input.answer);
  if (n === 0 && options.answerRequired) {
    checks.push({ level: "warn", field: "answer", message: "Λείπει η σύντομη απάντηση (40–60 λέξεις)." });
  } else if (n > 0 && (n < ANSWER_WORDS.min || n > ANSWER_WORDS.max)) {
    checks.push({ level: "warn", field: "answer", message: `Η σύντομη απάντηση έχει ${n} λέξεις (40–60).` });
  }

  const all = [input.title, input.seoTitle, input.metaDescription, input.answer, input.body, ...(input.faq ?? []).flatMap((p) => [p.q, p.a])]
    .filter(Boolean)
    .join("\n");
  if (DEALER_WORDING.test(all)) {
    checks.push({ level: "error", field: "body", message: "Γράφει «αντιπρόσωπος», «επίσημος διανομέας» ή παρόμοιο: το κατάστημα δεν το δηλώνει." });
  }
  if (PRICE.test(all)) checks.push({ level: "warn", field: "body", message: "Αναφέρει τιμή: οι τιμές αλλάζουν, η σελίδα του προϊόντος τις δείχνει." });
  if (STOCK.test(all)) checks.push({ level: "warn", field: "body", message: "Αναφέρει απόθεμα: αλλάζει ώρα με την ώρα, η σελίδα του προϊόντος το δείχνει." });

  return checks;
}

/** The internal links of a Markdown body: `/katalogos/x`, `/proion/y`, … (Greek paths). */
export function internalLinks(markdown: string | null | undefined): string[] {
  const found = new Set<string>();
  for (const match of (markdown ?? "").matchAll(/\]\((\/[^)\s#?]*)/g)) found.add(match[1].replace(/\/+$/, "") || "/");
  return [...found];
}

export type JsonLdBlock = { types: string[]; issues: string[]; raw: string };

/**
 * The JSON-LD blocks of a page, each with its types and what is wrong with it:
 * invalid JSON, or a type missing what Google needs to use it. Pure: the admin
 * fetches the HTML, this reads it.
 */
export function jsonLdBlocks(html: string): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    const raw = match[1];
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      blocks.push({ types: [], issues: [`Μη έγκυρο JSON: ${error instanceof Error ? error.message : String(error)}`], raw });
      continue;
    }
    if (data == null || typeof data !== "object") {
      blocks.push({ types: [], issues: ["Κενό block: δεν περιέχει αντικείμενο."], raw });
      continue;
    }
    const items: Array<Record<string, unknown>> = Array.isArray(data)
      ? (data as Array<Record<string, unknown>>)
      : Array.isArray((data as Record<string, unknown>)["@graph"])
        ? ((data as Record<string, unknown>)["@graph"] as Array<Record<string, unknown>>)
        : [data as Record<string, unknown>];
    const types: string[] = [];
    const issues: string[] = [];
    for (const item of items) {
      if (item == null || typeof item !== "object") {
        issues.push("Στοιχείο χωρίς περιεχόμενο.");
        continue;
      }
      const type = String(item["@type"] ?? "—");
      types.push(type);
      const need = (field: string, ok: unknown) => {
        if (ok == null || ok === "" || (Array.isArray(ok) && ok.length === 0)) issues.push(`${type}: λείπει το ${field}`);
      };
      if (type === "Product") {
        need("name", item.name);
        need("image", item.image);
        const offers = item.offers as Record<string, unknown> | undefined;
        if (offers) {
          need("offers.price", offers.price);
          need("offers.priceCurrency", offers.priceCurrency);
          need("offers.availability", offers.availability);
        }
      } else if (type === "ProductGroup") {
        need("name", item.name);
        need("hasVariant", item.hasVariant);
      } else if (type === "BreadcrumbList") {
        need("itemListElement", item.itemListElement);
      } else if (type === "FAQPage") {
        need("mainEntity", item.mainEntity);
      } else if (type === "BlogPosting" || type === "Article") {
        need("headline", item.headline);
        need("datePublished", item.datePublished);
        need("image", item.image);
      }
    }
    blocks.push({ types, issues, raw });
  }
  return blocks;
}
