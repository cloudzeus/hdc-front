import { describe, expect, it } from "vitest";
import type { HdctoolMilwaukeeCategory } from "@/lib/hdctool/client";
import {
  batteryFills,
  buildMegaMenu,
  formatCount,
  menuHref,
  menuName,
  orderGroups,
  rootHeroTop,
  rootSequence,
  splitRoots,
  topFor,
  type Counts,
  type CountRow,
  type LocalCategory,
  type MegaGroup,
  type TopRow,
} from "@/lib/catalog/mega-menu-core";

const c = (all: number, M12 = 0, M18 = 0, MX = 0): Counts => ({ all, M12, M18, MX });

describe("menuName", () => {
  it("drops the tonos, keeps the dialytika, and turns « - » into « · »", () => {
    expect(menuName("ΕΞΟΠΛΙΣΜΟΣ ΗΛΕΚΤΡΟΛΟΓΩΝ & ΗΛΕΚΤΡΟΝΙΚΏΝ - ΦΩΤΙΣΜΟΣ")).toBe(
      "ΕΞΟΠΛΙΣΜΟΣ ΗΛΕΚΤΡΟΛΟΓΩΝ & ΗΛΕΚΤΡΟΝΙΚΩΝ · ΦΩΤΙΣΜΟΣ",
    );
    expect(menuName("Παϊδάκια")).toBe("ΠΑΪΔΑΚΙΑ");
    expect(menuName("ΠΕΡΙΣΤΡΟΦΙΚΑ -  ΣΚΑΠΤΙΚΑ ΠΙΣΤΟΛΕΤΑ")).toBe(
      "ΠΕΡΙΣΤΡΟΦΙΚΑ · ΣΚΑΠΤΙΚΑ ΠΙΣΤΟΛΕΤΑ",
    );
  });

  it("leaves hyphens without spaces alone", () => {
    expect(menuName("ΕΡΓΑΛΕΙΟΘΗΚΕΣ-ΣΚΑΦΑΚΙΑ")).toBe("ΕΡΓΑΛΕΙΟΘΗΚΕΣ-ΣΚΑΦΑΚΙΑ");
    expect(menuName("SDS-plus bits")).toBe("SDS-PLUS BITS");
  });
});

describe("splitRoots", () => {
  const roots = [
    { id: "battery", c: c(409, 117, 256, 11) },
    { id: "hand", c: c(528, 6, 0, 0) },
    { id: "drill", c: c(271) },
    { id: "light", c: c(58, 12, 21, 2) },
  ];

  it("keeps the curated order for ΟΛΕΣ", () => {
    const { fit, uni } = splitRoots(roots, "all");
    expect(fit.map((r) => r.id)).toEqual(["battery", "hand", "drill", "light"]);
    expect(uni).toEqual([]);
  });

  it("puts the roots with the platform first, most products first", () => {
    const { fit, uni } = splitRoots(roots, "M18");
    expect(fit.map((r) => r.id)).toEqual(["battery", "light"]);
    expect(uni.map((r) => r.id)).toEqual(["hand", "drill"]);
    expect(rootSequence(roots, "M12").map((r) => r.id)).toEqual([
      "battery",
      "light",
      "hand",
      "drill",
    ]);
  });
});

describe("orderGroups", () => {
  const groups = [
    { id: "a", c: c(14, 7, 6) },
    { id: "b", c: c(1, 0, 1) },
    { id: "c", c: c(110, 49, 59) },
    { id: "d", c: c(10, 10, 0) },
  ];

  it("sorts by count and dims the empty ones at the end", () => {
    expect(orderGroups(groups, "M18", false).map((g) => [g.group.id, g.n])).toEqual([
      ["c", 59],
      ["a", 6],
      ["b", 1],
      ["d", 0],
    ]);
  });

  it("counts totals in a universal root", () => {
    expect(orderGroups(groups, "MX", true).map((g) => g.n)).toEqual([110, 14, 10, 1]);
  });
});

describe("batteryFills", () => {
  it("is each platform's share of the whole", () => {
    expect(batteryFills(c(2864, 202, 392, 14))).toEqual({ all: 100, M12: 7, M18: 14, MX: 0 });
    expect(batteryFills(c(0))).toEqual({ all: 0, M12: 0, M18: 0, MX: 0 });
  });
});

describe("links and numbers", () => {
  it("carries the platform, or platform=all when the row has none of it", () => {
    expect(menuHref("/katalogos/x", "all", c(5, 1))).toBe("/katalogos/x");
    expect(menuHref("/katalogos/x?sub=y", "M12", c(5, 1))).toBe("/katalogos/x?sub=y&platform=M12");
    expect(menuHref("/katalogos/x", "M18", c(5, 1))).toBe("/katalogos/x?platform=all");
  });

  it("groups thousands per language", () => {
    expect(formatCount(2864, "el")).toBe("2.864");
    expect(formatCount(2864, "en")).toBe("2,864");
    expect(formatCount(409, "it")).toBe("409");
  });
});

describe("buildMegaMenu", () => {
  const node = (
    id: string,
    erpType: "CATEGORY" | "GROUP",
    erpCode: string,
    el: string,
    order: number,
    children: HdctoolMilwaukeeCategory[] = [],
  ): HdctoolMilwaukeeCategory => ({
    id,
    parentId: null,
    erpType,
    erpCode,
    name: { el, en: `${el} EN`, it: `${el} IT` },
    order,
    mainImage: `https://cdn/${id}.webp`,
    children,
  });

  const tree = [
    node("hand", "CATEGORY", "10", "Εργαλεία χειρός", 0, [
      node("g-scr", "GROUP", "1001", "ΚΑΤΣΑΒΙΔΙΑ", 0),
    ]),
    node("bat", "CATEGORY", "12", "ΕΡΓΑΛΕΙΑ ΜΠΑΤΑΡΙΑΣ", -3, [
      node("g-drill", "GROUP", "1204", "ΔΡΑΠΑΝΑ", 0),
      node("g-grind", "GROUP", "1203", "ΓΩΝΙΑΚΟΙ - ΤΡΟΧΟΙ", 0),
      node("g-empty", "GROUP", "1299", "ΚΟΛΛΕΣ", 0),
    ]),
    node("glue", "CATEGORY", "19", "ΚΟΛΛΕΣ", 1),
    node("misc", "CATEGORY", "36", "ΔΙΑΦΟΡΑ", 15),
    node("move", "CATEGORY", "18", "ΜΕΤΑΦΟΡΑ - ΑΠΟΘΗΚΕΥΣΗ", -1),
    node("acc", "CATEGORY", "35", "ΕΞΑΡΤΗΜΑΤΑ ΗΛΕΚΤΡΙΚΩΝ ΕΡΓΑΛΕΙΩΝ ΚΑΙ ΜΠΑΤΑΡΙΑΣ", -1),
  ];

  const categories: LocalCategory[] = [
    {
      erpType: "CATEGORY",
      erpCode: "12",
      slug: "ergaleia-batarias",
      nameEl: "ΕΡΓΑΛΕΙΑ ΜΠΑΤΑΡΙΑΣ",
      parentCode: null,
    },
    {
      erpType: "CATEGORY",
      erpCode: "99",
      slug: "ergaleia-cheiros",
      nameEl: "ΕΡΓΑΛΕΙΑ ΧΕΙΡΟΣ",
      parentCode: null,
    },
    { erpType: "CATEGORY", erpCode: "36", slug: "diafora", nameEl: "ΔΙΑΦΟΡΑ", parentCode: null },
    { erpType: "GROUP", erpCode: "1204", slug: "drapana", nameEl: "ΔΡΑΠΑΝΑ", parentCode: "12" },
  ];

  const counts: CountRow[] = [
    { mtrcategory: 12, mtrgroup: 1204, platform: "M18", inStock: true, n: 5 },
    { mtrcategory: 12, mtrgroup: 1204, platform: "M12", inStock: false, n: 3 },
    { mtrcategory: 12, mtrgroup: 1203, platform: "M18", inStock: false, n: 2 },
    { mtrcategory: 12, mtrgroup: null, platform: null, inStock: true, n: 1 },
    { mtrcategory: 10, mtrgroup: 1001, platform: null, inStock: true, n: 7 },
    // The same group code under another category must not be borrowed.
    { mtrcategory: 11, mtrgroup: 1204, platform: "M18", inStock: true, n: 40 },
    { mtrcategory: 36, mtrgroup: null, platform: null, inStock: false, n: 4 },
  ];

  const top = (over: Partial<TopRow>): TopRow => ({
    mtrcategory: 12,
    mtrgroup: 1204,
    platform: "M18",
    name: "ΔΡΑΠΑΝΟ M18",
    code: "4933",
    price: 100,
    image: "https://cdn/p.webp",
    slug: "p",
    inStock: true,
    ...over,
  });
  const tops: TopRow[] = [
    top({ slug: "m18-dear", price: 300 }),
    top({ slug: "m12-cheap", platform: "M12", price: 90, inStock: false }),
    top({ slug: "none", platform: null, price: 900, inStock: false }),
  ];

  const menu = buildMegaMenu({ tree, locale: "el", categories, counts, tops });

  it("keeps the curated order and hides what has no products", () => {
    expect(menu.roots.map((r) => r.id)).toEqual(["bat", "hand", "misc"]);
    expect(menu.roots[0].groups.map((g) => g.id)).toEqual(["g-drill", "g-grind"]);
  });

  it("counts local products per platform, within the root", () => {
    const bat = menu.roots[0];
    expect(bat.c).toEqual({ all: 11, M12: 3, M18: 7, MX: 0 });
    expect(bat.s).toEqual({ all: 6, M12: 0, M18: 5, MX: 0 });
    expect(bat.groups[0].c).toEqual({ all: 8, M12: 3, M18: 5, MX: 0 });
    expect(menu.totals).toEqual({ all: 22, M12: 3, M18: 7, MX: 0 });
  });

  it("links by ERP code, then by Greek name, then to the catalogue", () => {
    const [bat, hand, misc] = menu.roots;
    expect(bat.href).toBe("/katalogos/ergaleia-batarias");
    expect(bat.groups[0].href).toBe("/katalogos/ergaleia-batarias?sub=drapana");
    expect(bat.groups[1].href).toBe("/katalogos/ergaleia-batarias");
    expect(hand.href).toBe("/katalogos/ergaleia-cheiros");
    expect(misc.href).toBe("/katalogos/diafora");
    expect(misc.groups).toEqual([]);
    expect(bat.groups[1].name).toBe("ΓΩΝΙΑΚΟΙ · ΤΡΟΧΟΙ");
  });

  it("picks the stage product: in stock first, then the dearest", () => {
    const drill = menu.roots[0].groups[0] as MegaGroup;
    expect(drill.top.all?.slug).toBe("m18-dear");
    expect(drill.top.M12?.slug).toBe("m12-cheap");
    expect(topFor(drill, "M12", false)?.slug).toBe("m12-cheap");
    expect(topFor(drill, "MX", false)?.slug).toBe("m18-dear");
    expect(rootHeroTop(menu.roots[0], "M18")?.slug).toBe("m18-dear");
  });

  it("maps the header items to their roots", () => {
    expect(menu.nav).toEqual({ battery: "bat", hand: "hand" });
  });

  it("uses the display language's names", () => {
    const en = buildMegaMenu({ tree, locale: "en", categories, counts, tops });
    expect(en.roots[0].name).toBe("ΕΡΓΑΛΕΙΑ ΜΠΑΤΑΡΙΑΣ EN");
    expect(en.nav.battery).toBe("bat");
  });
});
