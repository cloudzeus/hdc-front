import { slugify } from "@/lib/greek";

/**
 * Size variants for search: each size says which size and which code it is,
 * and the sizes are declared as one family.
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 *
 * A boot in eight sizes is eight codes and eight pages. The name the page
 * shows drops the size (`nameWithoutSize`: the picker below already says it),
 * which left eight pages with the same <title>, the same H1 and the same
 * description — duplicates to a search engine, and no answer to someone who
 * searched the code of the 43. So the title, the H1 and the description of a
 * size carry «Μέγεθος 43 · κωδικός 4932498126», and a `ProductGroup` with
 * `variesBy: size` tells Google the eight pages are one product in sizes. Each
 * page stays its own canonical.
 */

export type SizeOption = {
  slug: string;
  label: string;
  /** What the page calls its code: the manufacturer code, else the ERP code. */
  code: string;
  /** The manufacturer code alone (Milwaukee's article number), when there is one. */
  code2?: string | null;
  current: boolean;
};

/** «Μέγεθος {size} · κωδικός {code}», in the page's language. */
export type SizeCodeText = (size: string, code: string) => string;

/**
 * The name with its size and code — «NAME · Μέγεθος 43 · κωδικός …» — or the
 * name unchanged when the product is not one size of a family. With `name`
 * null, only the size part (or null).
 */
export function sizedText(name: string, sizes: SizeOption[], sizeCode: SizeCodeText): string;
export function sizedText(name: null, sizes: SizeOption[], sizeCode: SizeCodeText): string | null;
export function sizedText(name: string | null, sizes: SizeOption[], sizeCode: SizeCodeText): string | null {
  const current = sizes.length > 1 ? sizes.find((s) => s.current) : undefined;
  const part = current ? sizeCode(current.label, current.code) : null;
  if (name == null) return part;
  return part ? `${name} · ${part}` : name;
}

/**
 * The family as JSON-LD: the `ProductGroup`, and the properties the page's own
 * `Product` needs to join it (`@id`, `size`, `isVariantOf`). Null outside a
 * family of at least two sizes.
 *
 * The group's `@id` is built from the variant group itself, so every member's
 * page declares the same group whatever sizes are listed today.
 *
 * Greek only: search is for the Greek market (owner decision, 30/9/2026), and
 * the en/it pages are for visitors, not for search — no group there.
 */
export function sizeFamilyLd(input: {
  groupId: string | null;
  name: string;
  sizes: SizeOption[];
  url: (slug: string) => string;
  sizeCode: SizeCodeText;
  /** The site's origin, for the group's `@id`. */
  origin: string;
  /** The page's language; anything but Greek gets nothing. Default Greek. */
  locale?: string;
}) {
  const { groupId, name, sizes, url, sizeCode } = input;
  const current = sizes.find((s) => s.current);
  if ((input.locale ?? "el") !== "el") return null;
  if (!groupId || sizes.length < 2 || !current) return null;

  const groupRef = `${input.origin}/#productgroup-${slugify(groupId)}`;
  const group = {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    "@id": groupRef,
    productGroupID: groupId,
    name,
    brand: { "@type": "Brand", name: "Milwaukee" },
    variesBy: "https://schema.org/size",
    hasVariant: sizes.map((s) => ({
      "@type": "Product",
      "@id": `${url(s.slug)}#product`,
      name: `${name} · ${sizeCode(s.label, s.code)}`,
      // The same pair as the page's own Product: sku = the code it shows, mpn
      // only when it is Milwaukee's article number.
      sku: s.code,
      ...(s.code2?.trim() ? { mpn: s.code2.trim() } : {}),
      size: s.label,
      url: url(s.slug),
    })),
  };

  return {
    group,
    product: {
      "@id": `${url(current.slug)}#product`,
      size: current.label,
      inProductGroupWithID: groupId,
      isVariantOf: { "@id": groupRef },
    },
  };
}

/** «Νο 43» before a plain number (shoes); any other size («9/L», «XL») as is. */
function sizeToken(size: string): string {
  return /^\d+([.,]\d+)?$/.test(size) ? `Νο ${size}` : size;
}

/**
 * The Greek <title> of one size: «{name} Νο 43 · 4932498126».
 *
 * Size and code are what someone searching for this page typed, so they must
 * survive the ~60 characters a result shows. When the site name no longer fits
 * behind it, `absolute` says to drop the «| Milwaukee Heavy Duty Centre»
 * template; when even that is too long, the name is cut at a word.
 */
export function sizeTitleEl(input: {
  name: string;
  size: string;
  code: string;
  siteName: string;
  max?: number;
}): { title: string; absolute: boolean } {
  const max = input.max ?? 60;
  const tail = ` ${sizeToken(input.size)} · ${input.code}`;
  const full = `${input.name}${tail}`;
  if (`${full} | ${input.siteName}`.length <= max) return { title: full, absolute: false };
  if (full.length <= max) return { title: full, absolute: true };
  return { title: `${cutAtWord(input.name, max - tail.length)}${tail}`, absolute: true };
}

function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : text.slice(0, max)).replace(/[\s,;·–-]+$/, "");
}

/** A meta description of at most `max` characters, cut at a word, with «…». */
export function clampDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${cutAtWord(clean, max - 1)}…`;
}
