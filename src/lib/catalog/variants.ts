import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Availability } from "@/lib/catalog/availability";
import { compareSizeLabels, sizeDisplayLabel } from "@/lib/catalog/size-family";

/**
 * Τα αδέλφια ενός προϊόντος — τα ίδια γάντια σε άλλο μέγεθος.
 *
 * Επιστρέφει ΟΛΑ τα μεγέθη της ομάδας, όχι μόνο τα διαθέσιμα: ένα νούμερο που
 * απλώς λείπει από τη λίστα είναι αόρατο, και ο πελάτης δεν μαθαίνει ποτέ ότι
 * το XL υπάρχει αλλά τελείωσε. Το `inStock` το λέει, και ο επιλογέας το δείχνει
 * διαφορετικά — «υπάρχει, κατόπιν παραγγελίας» αντί για σιωπή.
 */
export type VariantOption = {
  slug: string;
  /** Όπως το γράφει το όνομα — «8/M» στα γάντια, «XXL», «42». */
  label: string;
  /** Ο κωδικός κατασκευαστή αυτού του μεγέθους. */
  code: string;
  inStock: boolean;
  /** Όχι δικό μας απόθεμα, αλλά το έχει ο προμηθευτής: «3–5 εργάσιμες». */
  supplierAvailable: boolean;
  /** Το νόημα του «M»: άλλο στα ρούχα, άλλο στα γάντια. */
  family: string | null;
  current: boolean;
};

export const variantsOf = cache(
  async (product: { id: string; variantGroup: string | null }): Promise<VariantOption[]> => {
    if (!product.variantGroup) return [];

    const rows = await prisma.product.findMany({
      where: { isActive: true, variantGroup: product.variantGroup },
      select: {
        id: true,
        slug: true,
        name: true,
        code: true,
        code2: true,
        qty: true,
        inStock: true,
        supplierAvailable: true,
        sizes: { select: { label: true, family: true }, orderBy: { order: "asc" } },
      },
    });

    const options: VariantOption[] = [];
    for (const row of rows) {
      const label = sizeDisplayLabel(row.name, row.sizes.map((s) => s.label));
      // Χωρίς ετικέτα δεν υπάρχει τι να πατήσει κανείς — ένα κενό κουμπί είναι
      // χειρότερο από μια γραμμή που λείπει.
      if (!label) continue;
      options.push({
        slug: row.slug,
        label,
        code: row.code2 || row.code,
        inStock: row.inStock && Number(row.qty ?? 0) > 0,
        supplierAvailable: !row.inStock && row.supplierAvailable,
        family: row.sizes[0]?.family ?? null,
        current: row.id === product.id,
      });
    }

    /*
     * Διπλά νούμερα: κρατά ένα, και προτιμά το τρέχον, μετά αυτό με απόθεμα.
     * ─────────────────────────────────────────────────────────────────────
     * Ο κατάλογος έχει πραγματικές διπλοκαταχωρίσεις — δύο MTRL για το ίδιο
     * είδος, ίδιο όνομα, ίδιο νούμερο. Δύο κουμπιά «42» δίπλα-δίπλα είναι
     * ερώτηση χωρίς απάντηση για τον πελάτη.
     */
    const byLabel = new Map<string, VariantOption>();
    for (const option of options) {
      const kept = byLabel.get(option.label);
      if (!kept || option.current || (!kept.current && !kept.inStock && option.inStock)) {
        byLabel.set(option.label, option);
      }
    }

    return [...byLabel.values()].sort((a, b) => compareSizeLabels(a.label, b.label));
  },
);

/** What a card that stands for a whole size family says about it. */
export type FamilySummary = {
  /** How many sizes the family has (active codes). */
  count: number;
  /** Whether ANY size is in stock — the card speaks for all of them. */
  inStock: boolean;
  /**
   * The family's availability: our stock in any size, else the supplier's in
   * any size, else to order. See `lib/catalog/availability.ts`.
   */
  availability: Availability;
  /**
   * Where the card opens: the smallest size in our stock, else the smallest
   * the supplier has, or null when neither (the card then opens its own, the
   * lead). The card keeps the lead's picture and price so it does not change
   * with every stock update; only the link follows the stock, so what the
   * card promises is what the shopper lands on.
   */
  openSlug: string | null;
};

type FamilyMember = {
  slug: string;
  name: string;
  inStock: boolean;
  supplierAvailable: boolean;
  qty: unknown;
  sizes: Array<{ label: string }>;
};

/**
 * One family's summary: size count, availability, and the smallest size that
 * has it — ours first, then the supplier's. Pure.
 */
export function summarizeFamily(members: FamilyMember[]): FamilySummary {
  const labelOf = (m: FamilyMember) =>
    sizeDisplayLabel(m.name, m.sizes.map((x) => x.label)) ?? m.sizes[0]?.label ?? "";
  const bySize = (list: FamilyMember[]) =>
    [...list].sort((a, b) => compareSizeLabels(labelOf(a), labelOf(b)))[0];
  // The same tests as the card's availability line, so the two never disagree.
  const ours = members.filter((m) => m.inStock);
  const theirs = members.filter((m) => !m.inStock && m.supplierAvailable);
  const open = ours.length > 0 ? bySize(ours) : theirs.length > 0 ? bySize(theirs) : undefined;
  return {
    count: members.length,
    inStock: ours.length > 0,
    availability: ours.length > 0 ? "stock" : theirs.length > 0 ? "supplier" : "order",
    openSlug: open?.slug ?? null,
  };
}

/**
 * Size count and stock per family, for a page of cards in one query.
 *
 * A family card that showed the lead's own stock would say «Παράδοση 1–3
 * εργάσιμες» for gloves whose 9/L is on the shelf, because the 7/S is not.
 */
export async function familySummaries(
  groups: Array<string | null | undefined>,
): Promise<Map<string, FamilySummary>> {
  const wanted = [...new Set(groups.filter((g): g is string => !!g))];
  const out = new Map<string, FamilySummary>();
  if (wanted.length === 0) return out;

  const rows = await prisma.product.findMany({
    where: { isActive: true, variantGroup: { in: wanted } },
    select: {
      slug: true,
      name: true,
      variantGroup: true,
      inStock: true,
      supplierAvailable: true,
      qty: true,
      sizes: { select: { label: true }, orderBy: { order: "asc" } },
    },
  });
  const byGroup = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.variantGroup) continue;
    byGroup.set(row.variantGroup, [...(byGroup.get(row.variantGroup) ?? []), row]);
  }
  for (const [group, members] of byGroup) {
    out.set(group, summarizeFamily(members));
  }
  return out;
}

/**
 * The cards, each with its family's summary when it stands for one. `groupOf`
 * reads the family from the card's source row, in the same order.
 */
export async function withFamilies<T extends { sizes?: FamilySummary | null }>(
  cards: T[],
  groupOf: (index: number) => string | null | undefined,
): Promise<T[]> {
  const summaries = await familySummaries(cards.map((_, i) => groupOf(i)));
  if (summaries.size === 0) return cards;
  return cards.map((card, i) => {
    const group = groupOf(i);
    const summary = group ? summaries.get(group) : undefined;
    return summary && summary.count > 1 ? { ...card, sizes: summary } : card;
  });
}
