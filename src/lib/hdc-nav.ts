import { searchKey } from "@/lib/greek";

/**
 * The HDC header's five destinations, resolved against the categories that
 * actually exist.
 *
 * The HDC's own category tree (HDCtool H4) is not deployed yet, so there are no
 * fixed slugs to hard-code: the synced ERP categories are named things like
 * "ΕΞΑΡΤΗΜΑΤΑ ΗΛΕΚΤΡΙΚΩΝ ΕΡΓΑΛΕΙΩΝ ΚΑΙ ΜΠΑΤΑΡΙΑΣ", and they can be empty while
 * a sync runs. So each item is matched by name, and falls back to a page that
 * always exists (the catalogue, or a search) rather than to a dead link.
 *
 * When the mega menu arrives (Plan 3, Task 8) this is the one place to replace.
 */

export type HdcNavKey = "battery" | "accessories" | "packout" | "hand" | "offers";

export type HdcNavItem = { key: HdcNavKey; href: string };

export type Named = { slug: string; name: string };

/** Needles are in `searchKey` form: lowercase, no accents, final ς as σ. */
export const has = (name: string, ...needles: string[]) => {
  const key = searchKey(name);
  return needles.some((needle) => key.includes(needle));
};

export const isAccessories = (c: Named) => has(c.name, "αξεσουαρ", "εξαρτημ", "accessor");
export const isPackout = (c: Named) => has(c.name, "packout");
export const isHand = (c: Named) => has(c.name, "χειροσ", "hand tool");
export const isBattery = (c: Named) =>
  !isAccessories(c) && !isPackout(c) && !isHand(c) && has(c.name, "μπαταρ", "battery", "cordless");

const categoryHref = (categories: Named[], match: (c: Named) => boolean, fallback: string) => {
  const found = categories.find(match);
  return found ? `/katalogos/${found.slug}` : fallback;
};

/** Order is the header's order, left to right. */
export function resolveHdcNav(categories: Named[]): HdcNavItem[] {
  return [
    { key: "battery", href: categoryHref(categories, isBattery, "/katalogos") },
    { key: "accessories", href: categoryHref(categories, isAccessories, "/katalogos") },
    { key: "packout", href: categoryHref(categories, isPackout, "/anazitisi?q=PACKOUT") },
    { key: "hand", href: categoryHref(categories, isHand, "/katalogos") },
    { key: "offers", href: "/prosfores" },
  ];
}

/**
 * Whether a nav item is the page being viewed. `pathname` is locale-less (from
 * next-intl's `usePathname`). Fallback links to the bare catalogue or a search
 * never light up: several items share them, and underlining all of them at
 * once would say nothing.
 */
export function isHdcNavActive(href: string, pathname: string): boolean {
  if (href === "/katalogos" || href.startsWith("/anazitisi")) return false;
  const path = href.split("?")[0];
  return pathname === path || pathname.startsWith(`${path}/`);
}
