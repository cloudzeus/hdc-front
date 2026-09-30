import {
  has,
  isAccessories,
  isBattery,
  isHand,
  isPackout,
  type Named,
} from "@/lib/hdc-nav";

/**
 * The home page's category cards and store facts (mockup `home.html`,
 * "ΚΑΤΗΓΟΡΙΕΣ" and "ΤΟ ΚΑΤΑΣΤΗΜΑ").
 *
 * The eight cards are the Milwaukee categories of the approved mockup, with
 * the images HDCtool already holds for them. HDCtool's Milwaukee category tree
 * (H4) is not deployed yet, so each card is linked to the synced ERP category
 * it corresponds to, matched by name the same way the header matches its links
 * (`hdc-nav.ts`). A card with no match opens the catalogue instead of a dead
 * link, and shows no group count rather than an invented one.
 */

export type HomeCategoryKey =
  | "battery"
  | "accessories"
  | "packout"
  | "hand"
  | "drilling"
  | "grinding"
  | "electrical"
  | "ppe";

const IMG = "https://kolleris.b-cdn.net/milwaukee-categories";

const HOME_CATEGORIES: Array<{
  key: HomeCategoryKey;
  image: string;
  match: (c: Named) => boolean;
  fallback: string;
}> = [
  {
    key: "battery",
    image: `${IMG}/cmi5h59py000jd4uqbek352zg-mainImage-1763557467437.webp`,
    match: isBattery,
    fallback: "/katalogos",
  },
  {
    key: "accessories",
    image: `${IMG}/cmi5h58wm000bd4uqx1ohwrmf-mainImage-1763540496143.webp`,
    match: isAccessories,
    fallback: "/katalogos",
  },
  {
    key: "packout",
    image: `${IMG}/cmi5h5awl000vd4uqdwy7ulzp-mainImage-1763632776577.webp`,
    match: (c) => isPackout(c) || has(c.name, "αποθηκευσ", "storage"),
    fallback: "/anazitisi?q=PACKOUT",
  },
  {
    key: "hand",
    image: `${IMG}/cmi5h59x4000ld4uqir8p80r2-mainImage-processed-1763562291553.webp`,
    match: isHand,
    fallback: "/katalogos",
  },
  {
    key: "drilling",
    image: `${IMG}/cmi5h58740005d4uqa18lnffq-mainImage-1763650376841.webp`,
    match: (c) => has(c.name, "διατρησ", "drilling"),
    fallback: "/katalogos",
  },
  {
    key: "grinding",
    image: `${IMG}/cmi5h5ain000rd4uqn53fmlf6-mainImage-1763624071410.webp`,
    match: (c) => has(c.name, "λειανσ", "grinding"),
    fallback: "/katalogos",
  },
  {
    key: "electrical",
    image: `${IMG}/cmi5h593q000dd4uq940irpym-mainImage-1763555757669.webp`,
    match: (c) => has(c.name, "ηλεκτρολογ", "φωτισμ", "lighting"),
    fallback: "/katalogos",
  },
  {
    key: "ppe",
    image: `${IMG}/cmi5h5apn000td4uqbokxxnn7-mainImage-1763624490488.webp`,
    match: (c) => has(c.name, "ατομικησ προστασ", "protective"),
    fallback: "/katalogos",
  },
];

export type HomeCategoryCard = {
  key: HomeCategoryKey;
  image: string;
  href: string;
  /** Sub-groups of the matched category that have products; null when unmatched. */
  groups: number | null;
};

/**
 * `categories` are the synced root categories, matched on their Greek name
 * (the ERP's own, so the match does not depend on the visitor's language),
 * with `groups` = how many of their children have products.
 */
export function resolveHomeCategories(
  categories: Array<Named & { groups: number }>,
): HomeCategoryCard[] {
  return HOME_CATEGORIES.map(({ key, image, match, fallback }) => {
    const found = categories.find(match);
    return {
      key,
      image,
      href: found ? `/katalogos/${found.slug}` : fallback,
      groups: found && found.groups > 0 ? found.groups : null,
    };
  });
}

/*
 * Whether the store is open lives with the rest of the hours logic
 * (Saturday has its own window), re-exported for the existing callers.
 */
export { isStoreOpen } from "@/lib/contact/hours";

/** Google Maps directions to the store, from its printed address. */
export function directionsUrl(contact: { street: string; postcode: string; city: string }): string {
  const destination = `${contact.street}, ${contact.postcode} ${contact.city}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/**
 * "ALL M18 DRILLS": the M18 hub (/milwaukee-m18), whose first category is the
 * drills group narrowed to M18 — a landing page for the platform rather than
 * a search.
 */
export function drillsHref(): string {
  return "/milwaukee-m18";
}
