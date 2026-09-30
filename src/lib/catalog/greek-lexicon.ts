import "server-only";
import { prisma } from "@/lib/prisma";
import { sharedCatalogue } from "@/lib/catalog/shared-cache";
import { searchKey } from "@/lib/greek";
import type { Lexicon } from "@/lib/seo/product-seo";

const DAY = 60 * 60 * 24;

/**
 * Every Greek word the store has written — product short descriptions, the
 * articles and guides, the SEO copy — by its accent-free key, in its most
 * frequent spelling. What turns the ERP's accentless capitals («ΦΑΚΟΙ
 * ΕΠΑΝΑΦΟΡΤΙΖΟΜΕΝΟΙ») back into Greek («Φακοί επαναφορτιζόμενοι») for
 * titles, without a dictionary. Built once a day.
 */
export const getGreekLexicon = sharedCatalogue("greek-lexicon-v1", DAY, async (): Promise<Lexicon> => {
  const [products, articles, overrides] = await Promise.all([
    prisma.productTranslation.findMany({
      where: { locale: "el", product: { isActive: true } },
      select: { shortDescription: true },
    }),
    prisma.contentArticle.findMany({ select: { title: true, answer: true, body: true } }),
    prisma.seoOverride.findMany({ select: { h1: true, intro: true, body: true } }),
  ]);
  const counts = new Map<string, Map<string, number>>();
  const add = (text: string | null | undefined) => {
    if (!text) return;
    for (const word of text.match(/[\p{Script=Greek}]+/gu) ?? []) {
      if (word.length < 2) continue;
      const lower = word.toLocaleLowerCase("el");
      // A word in capitals carries no accents: it teaches nothing.
      if (word === word.toLocaleUpperCase("el") && word.length > 1) continue;
      const key = searchKey(lower);
      const spellings = counts.get(key) ?? new Map<string, number>();
      spellings.set(lower, (spellings.get(lower) ?? 0) + 1);
      counts.set(key, spellings);
    }
  };
  for (const p of products) add(p.shortDescription);
  for (const a of articles) [a.title, a.answer, a.body].forEach(add);
  for (const o of overrides) [o.h1, o.intro, o.body].forEach(add);

  const lexicon: Lexicon = {};
  for (const [key, spellings] of counts) {
    lexicon[key] = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return lexicon;
});
