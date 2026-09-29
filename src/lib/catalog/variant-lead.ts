import "server-only";
import { prisma } from "@/lib/prisma";
import { planSizeFamilies, type FamilyRow } from "@/lib/catalog/size-family";

/**
 * Size families and the one code that represents each in the listings.
 *
 * Runs at the end of every catalogue sync — the full walk, the nightly
 * reconcile and every delta delivery — in bulk: a few hundred sized products,
 * one read, and one write per family that changed.
 *
 * ── Families ────────────────────────────────────────────────────────────────
 *
 * HDCtool sends `variantGroup`, but its rule only recognises a size written on
 * its own («No 36», «XL»). Gloves are `8/M`, `M/8` or `10 (XL)`, clothing says
 * `XXL` where the label is `2XL`, and some names use Greek `Μ`: 200+ gloves and
 * garments arrived ungrouped, one card per size. `planSizeFamilies` keeps every
 * HDCtool grouping and adds what its rule missed (see `size-family.ts`).
 *
 * ── The lead ────────────────────────────────────────────────────────────────
 *
 * The SMALLEST size, then the lowest code — a stable choice, not «the one in
 * stock». Stock changes every ten minutes, and a listing that swaps picture and
 * price on its own looks broken. Which sizes exist today is the product page's
 * job, where it matters.
 */
export async function refreshVariantLeads(): Promise<{
  groups: number;
  followers: number;
  regrouped: number;
}> {
  const rows = await prisma.product.findMany({
    where: { isActive: true, OR: [{ sizes: { some: {} } }, { variantGroup: { not: null } }] },
    select: {
      id: true,
      code: true,
      code2: true,
      name: true,
      variantGroup: true,
      priceNet: true,
      sizes: { select: { label: true }, orderBy: { order: "asc" } },
    },
  });

  const input: FamilyRow[] = rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    mpn: row.code2 || null,
    sizeLabels: row.sizes.map((s) => s.label),
    current: row.variantGroup,
    priceNet: row.priceNet == null ? null : Number(row.priceNet),
  }));
  const plan = planSizeFamilies(input);

  // One write per target value, only for rows that change.
  const byTarget = new Map<string | null, string[]>();
  for (const row of input) {
    const target = plan.group.get(row.id) ?? null;
    if (target === (row.current ?? null)) continue;
    (byTarget.get(target) ?? byTarget.set(target, []).get(target)!).push(row.id);
  }

  const followers = input
    .filter((row) => plan.group.get(row.id) && !plan.leads.has(row.id))
    .map((row) => row.id);

  await prisma.$transaction([
    ...[...byTarget].map(([variantGroup, ids]) =>
      prisma.product.updateMany({ where: { id: { in: ids } }, data: { variantGroup } }),
    ),
    // Everyone else is a lead: whatever left a family, or is alone in one, must
    // be listed again, or it would vanish from the listings for good.
    prisma.product.updateMany({
      where: { isVariantLead: false, id: { notIn: followers } },
      data: { isVariantLead: true },
    }),
    prisma.product.updateMany({
      where: { isVariantLead: true, id: { in: followers } },
      data: { isVariantLead: false },
    }),
  ]);

  const groups = new Set([...plan.group.values()].filter(Boolean)).size;
  const regrouped = [...byTarget.values()].reduce((sum, ids) => sum + ids.length, 0);
  return { groups, followers: followers.length, regrouped };
}
