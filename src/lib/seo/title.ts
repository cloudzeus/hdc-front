import { SHOP } from "@/config/shop";

/**
 * A page <title>, with the «| Milwaukee Heavy Duty Centre» template when it
 * still fits in about 65 characters, and on its own (`absolute`) when it does
 * not: what someone searched for must survive the cut, the site name need not.
 */
export function titleWithSite(title: string, max = 65): string | { absolute: string } {
  return `${title} | ${SHOP.name}`.length <= max ? title : { absolute: title };
}
