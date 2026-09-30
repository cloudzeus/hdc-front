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

export type SizeOption = { slug: string; label: string; code: string; current: boolean };

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
 * The group's `@id` is built from the first size's page, so every member's
 * page declares the same group.
 */
export function sizeFamilyLd(input: {
  groupId: string | null;
  name: string;
  sizes: SizeOption[];
  url: (slug: string) => string;
  sizeCode: SizeCodeText;
}) {
  const { groupId, name, sizes, url, sizeCode } = input;
  const current = sizes.find((s) => s.current);
  if (!groupId || sizes.length < 2 || !current) return null;

  const groupRef = `${url(sizes[0].slug)}#group`;
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
      sku: s.code,
      mpn: s.code,
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
