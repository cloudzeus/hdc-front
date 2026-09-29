import type { HdctoolMilwaukeeCategory } from "@/lib/hdctool/client";

/**
 * English and Italian category names from HDCtool's Milwaukee tree.
 *
 * The general category feed (`/api/public/categories`) carries the Greek name
 * copied into the English and Italian fields for most groups, so the English
 * product page read «ΕΡΓΑΛΕΙΟΘΗΚΕΣ-ΣΚΑΦΑΚΙΑ-ΚΟΥΤΙΑ ΑΠΟΘΗΚΕΥΣΗΣ» in its
 * breadcrumb. The Milwaukee tree (H4) has checked translations for every node
 * this shop uses, under the same ERP type and code, so it wins where it has a
 * real one. Pure, for the test.
 */

export type LocalNames = { en: string; it: string };

const GREEK = /[Ͱ-Ͽἀ-῿]/;

/** A usable translation: present and not Greek (Φ, the diameter sign, aside). */
const usable = (value: string | null | undefined): value is string =>
  Boolean(value?.trim()) && !GREEK.test(value!.replace(/Φ/g, ""));

export const milwaukeeKey = (erpType: string, erpCode: string) => `${erpType}:${erpCode}`;

/** Flatten the tree into erpType:erpCode → names. */
export function milwaukeeNameIndex(roots: HdctoolMilwaukeeCategory[]): Map<string, LocalNames> {
  const index = new Map<string, LocalNames>();
  const walk = (nodes: HdctoolMilwaukeeCategory[]) => {
    for (const node of nodes) {
      index.set(milwaukeeKey(node.erpType, node.erpCode), { en: node.name.en, it: node.name.it });
      walk(node.children ?? []);
    }
  };
  walk(roots);
  return index;
}

/** The feed's names, with the Milwaukee tree's translation where it has one. */
export function withMilwaukeeNames(base: LocalNames, milwaukee: LocalNames | undefined): LocalNames {
  return {
    en: usable(milwaukee?.en) ? milwaukee!.en.trim() : base.en,
    it: usable(milwaukee?.it) ? milwaukee!.it.trim() : base.it,
  };
}
