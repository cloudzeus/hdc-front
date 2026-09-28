import { SHOP } from "@/config/shop";

/**
 * Does this product belong in this shop's catalogue?
 *
 * HDCtool's public API has no brand filter on its change feed or its id list,
 * so every sync path sees the whole eshop catalogue. This is the single gate
 * that keeps anything but Milwaukee from ever being written here.
 *
 * Checks the raw HDCtool `brand.mtrmark`, not `canonicalMark()` from
 * catalog-sync.ts: canonicalMark exists for brands the ERP entered more than
 * once (Facom is 1308 + 1443 "FACOM PB"), and folds a secondary MTRMARK back
 * to the one the Brand row treats as canonical. Milwaukee has a single
 * MTRMARK (1364) with no secondary code, so every Milwaukee product already
 * arrives with `brand.mtrmark === 1364` — there is nothing for a canonical
 * lookup to fold. Gating on the raw mark also means this function stays pure
 * (no Brand-table read, no async), so it can run before anything is fetched
 * from, or written to, the database.
 */
export function isShopProduct(p: { brand?: { mtrmark?: number | null } | null }): boolean {
  return p.brand?.mtrmark === SHOP.mtrmark;
}
