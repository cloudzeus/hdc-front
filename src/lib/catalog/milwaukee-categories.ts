import "server-only";
import { sharedCatalogue } from "@/lib/catalog/shared-cache";
import { searchKey } from "@/lib/greek";
import { hdctool, type HdctoolMilwaukeeCategory } from "@/lib/hdctool/client";

/**
 * Photos for the category band, from HDCtool's Milwaukee category tree.
 *
 * The eshop's own category rows carry the Kolleris pictures; the Milwaukee
 * tree has Milwaukee's. The two share ERP codes but not always spelling, so a
 * node is found by its Greek name first (accents and case ignored) and by its
 * ERP code only when no name matches.
 */

type Node = { nameKey: string; erpType: string; erpCode: string; mainImage: string | null };

/** The tree flattened to what the matcher needs. Pure. */
export function flattenMilwaukeeTree(tree: HdctoolMilwaukeeCategory[]): Node[] {
  const out: Node[] = [];
  const walk = (nodes: HdctoolMilwaukeeCategory[]) => {
    for (const node of nodes) {
      out.push({
        nameKey: searchKey(node.name?.el ?? ""),
        erpType: node.erpType,
        erpCode: String(node.erpCode),
        mainImage: node.mainImage || null,
      });
      if (node.children?.length) walk(node.children);
    }
  };
  walk(tree);
  return out;
}

/** The Milwaukee photo for one eshop category, or null. Pure. */
export function findMilwaukeeImage(
  nodes: Node[],
  category: { nameEl: string; erpType: string; erpCode: string },
): string | null {
  const key = searchKey(category.nameEl);
  const byName = nodes.find((n) => n.nameKey === key && n.mainImage);
  if (byName) return byName.mainImage;
  const byCode = nodes.find(
    (n) => n.erpType === category.erpType && n.erpCode === category.erpCode && n.mainImage,
  );
  return byCode?.mainImage ?? null;
}

/*
 * One hour, shared across requests. A failure THROWS inside the cached
 * function, so it is not cached: the next request tries HDCtool again instead
 * of rendering an hour of bands without pictures.
 */
const loadTree = sharedCatalogue("hdctool-milwaukee-categories", 3600, async () => {
  const response = await hdctool.milwaukeeCategories();
  if (!response.success || !Array.isArray(response.data)) {
    throw new Error("milwaukee-categories: unexpected response");
  }
  return flattenMilwaukeeTree(response.data);
});

/**
 * The band photo for a category. Never throws: when HDCtool is unreachable the
 * band renders without a picture rather than the page failing.
 */
export async function milwaukeeCategoryImage(category: {
  nameEl: string;
  erpType: string;
  erpCode: string;
}): Promise<string | null> {
  try {
    return findMilwaukeeImage(await loadTree(), category);
  } catch (error) {
    console.warn("[hdc] Milwaukee category tree unavailable:", (error as Error).message);
    return null;
  }
}
