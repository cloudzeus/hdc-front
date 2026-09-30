import { withAccents, type Lexicon } from "@/lib/seo/product-seo";
import { cutAtWord } from "@/lib/seo/size-variant";

/**
 * A category's automatic <title> and meta description (Greek), used when its
 * CATEGORY SeoOverride does not set them (docs/content/seo/categories covers
 * 30 of them).
 *
 *   title  «Κρουστικά δράπανα Milwaukee M12 & M18» — lower case with accents,
 *          the brand, and the platforms when the category has them
 *   meta   what it is, how many codes, which platforms, its first groups,
 *          and Piraeus — different for every category because the data is
 *
 * The ERP names are capitals without accents; `accentedName` recovers the
 * accents from the category's own product descriptions and keeps the capitals
 * when a word cannot be spelt (a misspelt title is worse than a loud one).
 */

export type CategorySeoInput = {
  /** The name to show: accented, or ERP capitals. */
  name: string;
  total: number;
  /** Battery platforms with products here, in display form («M18», «MX FUEL»). */
  platforms: string[];
  /** The first child groups, by name. */
  children: string[];
};

export function accentedName(
  erpName: string,
  greekTexts: Array<string | null | undefined>,
  lexicon: Lexicon = {},
): string {
  const clean = erpName.replace(/\s+/g, " ").trim();
  const accented = withAccents(clean, greekTexts, lexicon);
  return accented === clean ? clean : accented;
}

const joinPlatforms = (platforms: string[]) =>
  platforms.length <= 1 ? (platforms[0] ?? "") : `${platforms.slice(0, -1).join(", ")} & ${platforms.at(-1)}`;

export function categoryTitle(input: Pick<CategorySeoInput, "name" | "platforms">): string {
  const base = `${input.name} Milwaukee`;
  const withPlatforms = input.platforms.length ? `${base} ${joinPlatforms(input.platforms)}` : base;
  return withPlatforms.length <= 60 ? withPlatforms : base;
}

export function categoryDescription(input: CategorySeoInput): string {
  const lower = /\p{Ll}/u.test(input.name) ? input.name : `«${input.name}»`;
  const platforms = input.platforms.length ? ` για ${joinPlatforms(input.platforms)}` : "";
  const head = `${lower} Milwaukee${platforms}`;
  const end = "Γνήσια εργαλεία Milwaukee με εγγύηση, παραλαβή στον Πειραιά ή αποστολή σε όλη την Ελλάδα.";
  for (let k = Math.min(3, input.children.length); k >= 0; k--) {
    const kids = k ? `, ανάμεσά τους ${input.children.slice(0, k).join(", ")}` : "";
    const text = `${head}${kids}. ${end}`;
    if (text.length <= 155) return text;
  }
  const text = `${head}. ${end}`;
  return text.length <= 155 ? text : `${cutAtWord(text, 154)}…`;
}
