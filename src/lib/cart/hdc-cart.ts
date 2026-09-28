import "server-only";
import { cache } from "react";
import type { Locale } from "@/i18n/routing";
import { prisma } from "@/lib/prisma";
import { getCartCrossSell } from "@/lib/cart/cart";
import type { CartLineView } from "@/lib/cart/options";
import { getSameBatteryTools } from "@/lib/catalog/queries";
import { grossAmount } from "@/lib/format";
import { parseModel } from "@/lib/milwaukee/model";
import { boxFacts } from "@/lib/milwaukee/pdp";
import { parseTechBlock } from "@/lib/milwaukee/tech-block";
import { discountedNet, offerBadgeFor } from "@/lib/offers/badges";

/**
 * What the HDC cart adds on top of the Kolleris cart (checkout.html, screen 1):
 * the kit ↔ bare swap on a line, the kit's contents in the code line, and the
 * «ΔΟΥΛΕΥΟΥΝ ΜΕ ΤΙΣ ΜΠΑΤΑΡΙΕΣ ΣΑΣ» band.
 *
 * Reads only. Prices are the catalogue's, with the same campaign discount the
 * cart line applies, so the amount in «Αλλαγή σε σκέτο εργαλείο (X €)» is the
 * one the line will show after the swap.
 */

export type LineSwap = {
  productId: string;
  /** What the line becomes. */
  to: "bare" | "kit";
  /** Unit price after the swap, VAT-inclusive. */
  unitGross: number;
};

export type KitContents = {
  batteries: { count: number; ah: number } | null;
  /** The charger's model, "" when included but unnamed, null when not included. */
  charger: string | null;
  case: string | null;
};

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const getCartLineExtras = cache(
  async (
    locale: Locale,
    lines: CartLineView[],
  ): Promise<{ swaps: Record<string, LineSwap>; contents: Record<string, KitContents> }> => {
    const roots = [...new Set(lines.map((l) => l.modelRoot).filter((r): r is string => !!r))];
    if (roots.length === 0) return { swaps: {}, contents: {} };

    const siblings = await prisma.product.findMany({
      where: { isActive: true, modelRoot: { in: roots }, priceNet: { gt: 0 } },
      orderBy: [{ inStock: "desc" }, { priceNet: "asc" }, { mtrl: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        modelRoot: true,
        modelContent: true,
        mtrmark: true,
        priceNet: true,
        vatRate: true,
        translations: { where: { locale: "el" }, select: { longDescription: true } },
      },
    });

    const marks = [...new Set(siblings.map((s) => s.mtrmark).filter((m): m is number => m != null))];
    const brandSlugs = new Map(
      (marks.length
        ? await prisma.brand.findMany({
            where: { mtrmark: { in: marks } },
            select: { mtrmark: true, slug: true },
          })
        : []
      ).map((b) => [b.mtrmark!, b.slug]),
    );

    const inCart = new Set(lines.map((l) => l.productId));
    const swaps: Record<string, LineSwap> = {};
    const contents: Record<string, KitContents> = {};

    for (const line of lines) {
      if (!line.modelRoot || !line.modelContent) continue;

      const self = siblings.find((s) => s.id === line.productId);
      if (line.modelContent === "kit" && self) {
        const facts = boxFacts(parseTechBlock(self.translations[0]?.longDescription));
        const model = parseModel(self.name);
        contents[line.id] = {
          batteries:
            facts.batteries ??
            (model?.kit ? { count: model.kit.batteries, ah: model.kit.ah } : null),
          charger: facts.charger,
          case: facts.case,
        };
      }

      // The first of the other content — in stock first, then the cheapest.
      // A kit already sitting in the cart as its own line is not offered again.
      const target = siblings.find(
        (s) =>
          s.modelRoot === line.modelRoot &&
          s.modelContent !== line.modelContent &&
          (s.modelContent === "bare" || s.modelContent === "kit") &&
          !inCart.has(s.id),
      );
      if (!target) continue;

      const offer = await offerBadgeFor(
        {
          slug: target.slug,
          brandSlug: target.mtrmark != null ? (brandSlugs.get(target.mtrmark) ?? null) : null,
          unitNet: num(target.priceNet),
        },
        locale,
      );
      const unitNet = discountedNet(num(target.priceNet), offer?.discountPercent ?? 0);
      swaps[line.id] = {
        productId: target.id,
        to: target.modelContent as "bare" | "kit",
        unitGross: grossAmount(unitNet, { vatRate: num(target.vatRate) || 24 }),
      };
    }

    return { swaps, contents };
  },
);

export type CrossSellCard = {
  id: string;
  slug: string;
  name: string;
  code: string;
  image: string | null;
  /** VAT-inclusive, campaign discount applied. */
  priceGross: number;
};

/**
 * «ΔΟΥΛΕΥΟΥΝ ΜΕ ΤΙΣ ΜΠΑΤΑΡΙΕΣ ΣΑΣ»: in-stock BARE tools of the platform(s) in
 * the cart — the batteries the customer is already buying run all of them.
 * Nothing already in the cart, and no other version of a model in the cart
 * (the swap link covers that). Platforms by how many lines carry them.
 *
 * A cart with no battery platform in it falls back to the Kolleris cross-sell
 * (same group / category), with `platforms` empty so the band says so.
 */
export const getHdcCrossSell = cache(
  async (
    locale: Locale,
    lines: CartLineView[],
    limit = 4,
  ): Promise<{ platforms: string[]; items: CrossSellCard[] }> => {
    const counts = new Map<string, number>();
    for (const line of lines) {
      if (line.platform === "M12" || line.platform === "M18" || line.platform === "MX")
        counts.set(line.platform, (counts.get(line.platform) ?? 0) + 1);
    }
    const platforms = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
    const inCart = new Set(lines.map((l) => l.productId));
    const rootsInCart = new Set(lines.map((l) => l.modelRoot).filter(Boolean));

    if (platforms.length > 0) {
      const perPlatform = await Promise.all(
        platforms.map((p) => getSameBatteryTools(locale, p, null, limit * 3)),
      );
      const picked: CrossSellCard[] = [];
      const seen = new Set<string>();
      // Round-robin across the platforms, so an M12 + M18 cart sees both.
      for (let i = 0; picked.length < limit && i < limit * 3; i++) {
        for (const list of perPlatform) {
          const card = list[i];
          if (!card || picked.length >= limit || seen.has(card.id) || inCart.has(card.id)) continue;
          const root = parseModel(card.name)?.root;
          if (root && rootsInCart.has(root)) continue;
          seen.add(card.id);
          const offer = await offerBadgeFor(
            { slug: card.slug, brandSlug: card.brandSlug, unitNet: card.priceNet ?? 0 },
            locale,
          );
          picked.push({
            id: card.id,
            slug: card.slug,
            name: card.name,
            code: card.sku,
            image: card.image,
            priceGross: grossAmount(
              discountedNet(card.priceNet ?? 0, offer?.discountPercent ?? 0),
              { vatRate: card.vatRate },
            ),
          });
        }
      }
      if (picked.length > 0) return { platforms, items: picked };
    }

    const fallback = await getCartCrossSell(
      locale,
      lines.map((l) => l.productId),
      limit,
    );
    return {
      platforms: [],
      items: fallback.map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        code: item.sku,
        image: item.image,
        priceGross: grossAmount(item.priceNet, { vatRate: item.vatRate }),
      })),
    };
  },
);
