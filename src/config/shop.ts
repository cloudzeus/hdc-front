/**
 * Who this shop is. One place, so the Kolleris eshop this was copied from
 * cannot leak back in through a forgotten literal.
 *
 * The brand is fixed: this shop sells Milwaukee and nothing else (spec §1).
 * The company that runs it is Kolleris — that belongs in the legal footer, not
 * in the shop's name.
 */
export const SHOP = {
  name: "Milwaukee Heavy Duty Centre",
  /** HDCtool MTRMARK of the only brand this shop sells. */
  mtrmark: 1364,
  /** HDC-YYYYMMDD-NNNN — HDCtool routes and reconciles orders by this prefix. */
  orderPrefix: "HDC-",
  /** Every cookie this shop sets starts with this, never KOLLERIS_. */
  cookiePrefix: "HDC_",
} as const;
