import type { HdctoolMilwaukeeCategory } from "@/lib/hdctool/client";
import { has, isAccessories, isHand } from "@/lib/hdc-nav";
import { searchKey, upGreek } from "@/lib/greek";

/**
 * The HDC mega menu (mockup `docs/design/mockups/megamenu.html`), as plain
 * data and pure functions.
 *
 * Shared by the server loader (`mega-menu.ts`), which assembles the menu once
 * every ten minutes, and the client components, which re-count it for the
 * battery platform the visitor picks. Nothing here touches the database, the
 * network or the DOM, so every rule of the mockup is unit-tested:
 *
 *  - the tree, its order and its photos are HDCtool's Milwaukee tree;
 *  - every count comes from the eshop's OWN active products (the `platform`
 *    column the sync derives from the model code), never from HDCtool;
 *  - a root or group without products is not shown;
 *  - picking a platform splits the roots into «ΓΙΑ ΤΗΝ M18 ΣΑΣ» (the roots
 *    with M18 products, most first), «ΤΑΙΡΙΑΖΟΥΝ ΣΕ ΟΛΑ» (products tied to no
 *    platform, with their total counts) and, dimmed, «ΓΙΑ ΑΛΛΕΣ ΠΛΑΤΦΟΡΜΕΣ»
 *    (only other platforms' products) — see `rowFit`;
 *  - names are set in capitals without tonos, « - » becomes « · ».
 */

export const MENU_PLATFORMS = ["all", "M12", "M18", "MX"] as const;
export type MenuPlatform = (typeof MENU_PLATFORMS)[number];
export type BatteryPlatform = Exclude<MenuPlatform, "all">;

/** Products per platform. `all` includes the ones that fit every platform. */
export type Counts = Record<MenuPlatform, number>;

/** The product a stage shows: the first in stock with a photo, dearest first. */
export type MegaTop = {
  name: string;
  code: string;
  /** VAT included; null when the product has no price yet. */
  price: number | null;
  image: string;
  slug: string;
  inStock: boolean;
};

export type MegaGroup = {
  id: string;
  name: string;
  href: string;
  /** Active products. */
  c: Counts;
  /** Of those, in stock. */
  s: Counts;
  /** Best product overall (`all`) and per platform, where one exists. */
  top: Partial<Record<MenuPlatform, MegaTop>>;
};

export type MegaRoot = {
  id: string;
  name: string;
  /** Milwaukee's category photo from the HDCtool tree. */
  image: string | null;
  href: string;
  c: Counts;
  s: Counts;
  groups: MegaGroup[];
};

export type MegaNavKey = "battery" | "accessories" | "packout" | "hand";

export type MegaMenuData = {
  roots: MegaRoot[];
  /** All roots added up — the battery switch and the total on the right. */
  totals: Counts;
  /** Which root each header item opens the menu on (root id). */
  nav: Partial<Record<MegaNavKey, string>>;
};

// ── Names ─────────────────────────────────────────────────────────────────

/**
 * A category name as the menu sets it: capitals, tonos dropped, dialytika
 * kept («ΗΛΕΚΤΡΟΝΙΚΏΝ» → «ΗΛΕΚΤΡΟΝΙΚΩΝ»), « - » as « · », single spaces.
 */
export function menuName(name: string): string {
  return upGreek(name.replace(/\s+/g, " ").trim()).replace(/\s+-\s+/g, " · ");
}

// ── Counting ──────────────────────────────────────────────────────────────

export const emptyCounts = (): Counts => ({ all: 0, M12: 0, M18: 0, MX: 0 });

const isBattery = (value: string | null | undefined): value is BatteryPlatform =>
  value === "M12" || value === "M18" || value === "MX";

/** Adds `n` products of `platform` (null = fits every platform) to `c`. */
export function addCount(c: Counts, platform: string | null, n: number): void {
  c.all += n;
  if (isBattery(platform)) c[platform] += n;
}

export function sumCounts(list: Counts[]): Counts {
  const out = emptyCounts();
  for (const c of list) for (const key of MENU_PLATFORMS) out[key] += c[key];
  return out;
}

/** «ΟΛΕΣ» (translated), M12, M18, «MX FUEL». */
export const platformName = (p: MenuPlatform, allLabel: string): string =>
  p === "all" ? allLabel : p === "MX" ? "MX FUEL" : p;

export const countFor = (c: Counts, plat: MenuPlatform): number => c[plat] || 0;

/**
 * «Ταιριάζει σε όλα»: with a platform picked, a root with no product of that
 * platform (drill bits, hand tools, PACKOUT). It is still shown, with its
 * total, under its own heading — never hidden.
 */
export const isUniversal = (c: Counts, plat: MenuPlatform): boolean =>
  plat !== "all" && !(c[plat] > 0);

/** The number a row prints: its platform's count, or its total when universal. */
export const shownCount = (c: Counts, plat: MenuPlatform): number =>
  isUniversal(c, plat) ? c.all : countFor(c, plat);

// ── Ordering ──────────────────────────────────────────────────────────────

/** Products with no battery platform at all: they fit every platform. */
export const neutralCount = (c: Counts): number =>
  Math.max(0, c.all - c.M12 - c.M18 - c.MX);

/**
 * How a row (root or group) stands with the platform picked:
 *
 *  - `fit`: it has products of that platform («ΟΛΕΣ»: every row is `fit`);
 *  - `uni`: none of that platform, and mostly products tied to no platform at
 *    all (drill bits, hand tools, PACKOUT, corded tools) — «ΤΑΙΡΙΑΖΟΥΝ ΣΕ
 *    ΟΛΑ», with its total;
 *  - `off`: none of that platform and mostly OTHER platforms' products (the
 *    drills group when MX FUEL is picked: 108 M12/M18 drills and 2 without a
 *    model code). Calling it «fits every platform» would be false: it is
 *    shown dimmed, never hidden, so the menu keeps its shape and says what
 *    is missing.
 */
export type RowFit = "fit" | "uni" | "off";

export function rowFit(c: Counts, plat: MenuPlatform): RowFit {
  if (plat === "all" || c[plat] > 0) return "fit";
  const neutral = neutralCount(c);
  return neutral > 0 && neutral * 2 >= c.all ? "uni" : "off";
}

/**
 * The roots column. «ΟΛΕΣ»: one list in the curated order. A platform: the
 * roots that have it, most products first; then the ones that fit every
 * platform; then, dimmed, the ones that only have other platforms' products —
 * both of those in curated order.
 */
export function splitRoots<T extends { c: Counts }>(
  roots: T[],
  plat: MenuPlatform,
): { fit: T[]; uni: T[]; off: T[] } {
  if (plat === "all") return { fit: [...roots], uni: [], off: [] };
  const fit = roots
    .map((root, index) => ({ root, index }))
    .filter(({ root }) => root.c[plat] > 0)
    .sort((a, b) => b.root.c[plat] - a.root.c[plat] || a.index - b.index)
    .map(({ root }) => root);
  const uni = roots.filter((root) => rowFit(root.c, plat) === "uni");
  const off = roots.filter((root) => rowFit(root.c, plat) === "off");
  return { fit, uni, off };
}

/** The keyboard's ↑↓ order: exactly the order the column shows. */
export function rootSequence<T extends { c: Counts }>(roots: T[], plat: MenuPlatform): T[] {
  const { fit, uni, off } = splitRoots(roots, plat);
  return fit.concat(uni, off);
}

export type GroupRow<T> = { group: T; n: number; fit: RowFit };

/**
 * The groups column: the groups with products for the platform, most first;
 * then the ones that fit every platform, with their totals; then, dimmed at
 * the end «so it shows what is missing», the ones with only other platforms'
 * products, at 0. `n` is the number the row prints.
 */
export function orderGroups<T extends { c: Counts }>(
  groups: T[],
  plat: MenuPlatform,
): Array<GroupRow<T>> {
  const rows = groups.map((group, index) => {
    const fit = rowFit(group.c, plat);
    const n = fit === "fit" ? countFor(group.c, plat) : fit === "uni" ? group.c.all : 0;
    return { group, index, n, fit };
  });
  const byCount = (a: { n: number; index: number }, b: { n: number; index: number }) =>
    b.n - a.n || a.index - b.index;
  const pick = (fit: RowFit) => rows.filter((r) => r.fit === fit);
  return [...pick("fit").sort(byCount), ...pick("uni").sort(byCount), ...pick("off")].map(
    ({ group, n, fit }) => ({ group, n, fit }),
  );
}

/** How full each battery on the switch is: the platform's share, in %. */
export function batteryFills(totals: Counts): Counts {
  const pct = (n: number) => (totals.all > 0 ? Math.round((n / totals.all) * 100) : 0);
  return {
    all: totals.all > 0 ? 100 : 0,
    M12: pct(totals.M12),
    M18: pct(totals.M18),
    MX: pct(totals.MX),
  };
}

/** The product a group's stage shows for the platform, else its best overall. */
export function topFor(group: Pick<MegaGroup, "top">, plat: MenuPlatform, universal: boolean) {
  if (plat === "all" || universal) return group.top.all ?? null;
  return group.top[plat] ?? group.top.all ?? null;
}

/**
 * The stage of a root on the phone (and the fallback of the desktop one): the
 * photo of the best product in its biggest group for the platform.
 */
export function rootHeroTop(root: MegaRoot, plat: MenuPlatform): MegaTop | null {
  for (const { group, fit } of orderGroups(root.groups, plat)) {
    if (fit === "off") break;
    const top = topFor(group, plat, fit !== "fit");
    if (top) return top;
  }
  return null;
}

// ── Links ─────────────────────────────────────────────────────────────────

/** Appends `platform=P` (or any value) to a locale-less href. */
export function withParam(href: string, key: string, value: string): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${path}?${params.toString()}`;
}

/**
 * Where a menu row goes. With a platform picked, the listing opens filtered to
 * it. A row that has nothing for the platform (a universal root, a dimmed
 * group) says `platform=all` instead, so the listing does not fall back to the
 * remembered platform and open empty.
 */
export function menuHref(href: string, plat: MenuPlatform, count: Counts): string {
  if (plat === "all") return href;
  return withParam(href, "platform", count[plat] > 0 ? plat : "all");
}

// ── Numbers ───────────────────────────────────────────────────────────────

/** 2864 → «2.864» (el, it) or «2,864» (en). Written out, like `formatMoney`. */
export function formatCount(n: number, locale: string): string {
  const sep = locale === "en" ? "," : ".";
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

// ── Assembly ──────────────────────────────────────────────────────────────

export type LocalCategory = {
  erpType: "CATEGORY" | "GROUP" | "SUBGROUP";
  erpCode: string;
  slug: string;
  nameEl: string;
  /** erpCode of the parent CATEGORY, for groups. */
  parentCode: string | null;
};

export type CountRow = {
  mtrcategory: number | null;
  mtrgroup: number | null;
  platform: string | null;
  inStock: boolean;
  n: number;
};

export type TopRow = MegaTop & {
  mtrcategory: number | null;
  mtrgroup: number | null;
  platform: string | null;
};

const better = (a: MegaTop, b: MegaTop) =>
  a.inStock !== b.inStock ? a.inStock : (a.price ?? -1) > (b.price ?? -1);

const localName = (node: HdctoolMilwaukeeCategory, locale: string) => {
  const name = node.name ?? { el: "", en: "", it: "" };
  const value = locale === "en" ? name.en : locale === "it" ? name.it : name.el;
  return value?.trim() || name.el || "";
};

/**
 * The menu from the Milwaukee tree and the eshop's own numbers.
 *
 * The tree's ERP codes are the products' MTRCATEGORY (root) and MTRGROUP
 * (group) — a group is counted within its root, so a group code reused under
 * another category never borrows that category's products. The link target is
 * the synced category page: by ERP code, or by Greek name when the codes do
 * not meet.
 */
export function buildMegaMenu(input: {
  tree: HdctoolMilwaukeeCategory[];
  locale: string;
  categories: LocalCategory[];
  counts: CountRow[];
  tops: TopRow[];
}): MegaMenuData {
  const { tree, locale, categories, counts, tops } = input;

  const byRoot = new Map<number, { c: Counts; s: Counts }>();
  const byGroup = new Map<string, { c: Counts; s: Counts }>();
  const bucket = <K>(map: Map<K, { c: Counts; s: Counts }>, key: K) => {
    let entry = map.get(key);
    if (!entry) map.set(key, (entry = { c: emptyCounts(), s: emptyCounts() }));
    return entry;
  };
  for (const row of counts) {
    if (row.mtrcategory == null || row.n <= 0) continue;
    const root = bucket(byRoot, row.mtrcategory);
    addCount(root.c, row.platform, row.n);
    if (row.inStock) addCount(root.s, row.platform, row.n);
    if (row.mtrgroup == null) continue;
    const group = bucket(byGroup, `${row.mtrcategory}:${row.mtrgroup}`);
    addCount(group.c, row.platform, row.n);
    if (row.inStock) addCount(group.s, row.platform, row.n);
  }

  const topsByGroup = new Map<string, Partial<Record<MenuPlatform, MegaTop>>>();
  for (const row of tops) {
    if (row.mtrcategory == null || row.mtrgroup == null) continue;
    const key = `${row.mtrcategory}:${row.mtrgroup}`;
    const entry = topsByGroup.get(key) ?? {};
    const top: MegaTop = {
      name: row.name,
      code: row.code,
      price: row.price,
      image: row.image,
      slug: row.slug,
      inStock: row.inStock,
    };
    if (isBattery(row.platform) && (!entry[row.platform] || better(top, entry[row.platform]!))) {
      entry[row.platform] = top;
    }
    if (!entry.all || better(top, entry.all)) entry.all = top;
    topsByGroup.set(key, entry);
  }

  const localRoots = categories.filter((c) => c.erpType === "CATEGORY");
  const localGroups = categories.filter((c) => c.erpType === "GROUP");
  const findRoot = (node: HdctoolMilwaukeeCategory) =>
    localRoots.find((c) => c.erpCode === String(node.erpCode)) ??
    localRoots.find((c) => searchKey(c.nameEl) === searchKey(node.name?.el ?? ""));
  const findGroup = (node: HdctoolMilwaukeeCategory, rootCode: string) =>
    localGroups.find((c) => c.erpCode === String(node.erpCode)) ??
    localGroups.find(
      (c) => c.parentCode === rootCode && searchKey(c.nameEl) === searchKey(node.name?.el ?? ""),
    );

  const roots: MegaRoot[] = [];
  const ordered = tree
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.erpType === "CATEGORY")
    .sort((a, b) => (a.node.order ?? 0) - (b.node.order ?? 0) || a.index - b.index);

  for (const { node } of ordered) {
    const code = Number.parseInt(String(node.erpCode), 10);
    const numbers = Number.isNaN(code) ? undefined : byRoot.get(code);
    if (!numbers || numbers.c.all === 0) continue;

    const local = findRoot(node);
    const href = local ? `/katalogos/${local.slug}` : "/katalogos";

    const groups: MegaGroup[] = [];
    const children = (node.children ?? [])
      .map((child, index) => ({ child, index }))
      .filter(({ child }) => child.erpType === "GROUP")
      .sort((a, b) => (a.child.order ?? 0) - (b.child.order ?? 0) || a.index - b.index);
    for (const { child } of children) {
      const key = `${code}:${Number.parseInt(String(child.erpCode), 10)}`;
      const g = byGroup.get(key);
      if (!g || g.c.all === 0) continue;
      const localGroup = findGroup(child, String(node.erpCode));
      groups.push({
        id: child.id,
        name: menuName(localName(child, locale)),
        href: localGroup ? withParam(href, "sub", localGroup.slug) : href,
        c: g.c,
        s: g.s,
        top: topsByGroup.get(key) ?? {},
      });
    }

    roots.push({
      id: node.id,
      name: menuName(localName(node, locale)),
      image: node.mainImage || null,
      href,
      c: numbers.c,
      s: numbers.s,
      groups,
    });
  }

  return {
    roots,
    totals: sumCounts(roots.map((r) => r.c)),
    nav: resolveNavRoots(roots, tree),
  };
}

/**
 * The root each header item opens the menu on (mockup `NAV`): ΕΡΓΑΛΕΙΑ
 * ΜΠΑΤΑΡΙΑΣ, ΑΞΕΣΟΥΑΡ → the ERP «ΕΞΑΡΤΗΜΑΤΑ…», PACKOUT → «ΜΕΤΑΦΟΡΑ…», ΧΕΙΡΟΣ.
 * Matched on the Greek name, whatever the display language.
 */
export function resolveNavRoots(
  roots: Array<{ id: string }>,
  tree: HdctoolMilwaukeeCategory[],
): Partial<Record<MegaNavKey, string>> {
  const greek = new Map(tree.map((node) => [node.id, node.name?.el ?? ""]));
  const named = roots.map((root) => ({
    id: root.id,
    slug: root.id,
    name: greek.get(root.id) ?? "",
  }));
  const find = (match: (c: { slug: string; name: string }) => boolean) => named.find(match)?.id;
  const out: Partial<Record<MegaNavKey, string>> = {};
  const accessories = find(isAccessories);
  const hand = find(isHand);
  const packout = find((c) => has(c.name, "packout", "μεταφορα"));
  const battery = find(
    (c) => !isAccessories(c) && !isHand(c) && has(c.name, "μπαταρ", "battery", "cordless"),
  );
  if (battery) out.battery = battery;
  if (accessories) out.accessories = accessories;
  if (packout) out.packout = packout;
  if (hand) out.hand = hand;
  return out;
}
