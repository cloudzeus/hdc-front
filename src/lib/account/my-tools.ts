import { normalizeModelText, parseModel, type Platform } from "@/lib/milwaukee/model";
import { kitFromTechBlock, parseTechBlock } from "@/lib/milwaukee/tech-block";

/**
 * «ΤΑ ΕΡΓΑΛΕΙΑ ΜΟΥ» (account.html, screen 2): what a customer owns on each
 * battery platform, worked out from the lines of the orders they received.
 *
 * No new data. A tool is a product with a model root ("M18 FPD3"), counted
 * once per root — the bare tool and its kit are the same tool. A battery is a
 * platform product without a model root whose name carries a battery code
 * ("M18 B5", "M12 HB5", "M18 FB12"), counted by quantity; a kit adds the
 * batteries its manufacturer block says are in the box (× quantity), or, when
 * the block does not say, the ones its model suffix does (-502X = 2 × 5.0Ah).
 * Energy packs (M18 NRG-502, M12 HNRG) are batteries and a charger, not tools.
 *
 * Pure: the caller loads the lines (delivered or confirmed orders only) and
 * this decides what they mean, so every rule here is tested with fixtures.
 */

export type OwnedLine = {
  /** Anything stable per product — the product id, or the line's code. */
  key: string;
  /** The catalogue (ERP) name when known, else the order line's snapshot. */
  name: string;
  platform: string | null;
  modelRoot: string | null;
  modelContent: string | null;
  image: string | null;
  quantity: number;
  /** The Greek long description, for a kit's «Τεχνικά χαρακτηριστικά» block. */
  description?: string | null;
};

export type OwnedThumb = {
  kind: "tool" | "battery";
  name: string;
  image: string | null;
  /** Shown as ×N. Batteries always carry it; a tool only when bought more than once. */
  count: number | null;
};

export type PlatformTools = {
  platform: Platform;
  /** Distinct model roots. */
  tools: number;
  /** Loose batteries plus the ones that came in kits. */
  batteries: number;
  /** Capacities owned, largest first — "5.0" when there is one. */
  capacities: number[];
  /** Up to three: tools first, then the battery tile. */
  thumbs: OwnedThumb[];
  /**
   * The red line under the thumbnails. "bare": batteries and tools — the bare
   * tools run on what they already have. "tools": batteries but no tool yet.
   */
  tip: "bare" | "tools" | null;
};

const PLATFORM_ORDER: Platform[] = ["M18", "M12", "MX"];
const isPlatform = (p: string | null): p is Platform => p === "M12" || p === "M18" || p === "MX";

/** "M18 B5", "M12 HB2.5", "M18 FB12", "M18 B5-CR" — after `normalizeModelText`. */
const BATTERY_CODE = /\b(?:M12|M18)\s?(?:HB|FB|B)(\d+(?:[.,]\d+)?)(?=[\s-]|$)/;
const BATTERY_WORD = /(^|\s)(ΜΠΑΤΑΡΙΑ|BATTERY|BATTERIA)(\s|$)/i;
const AH_IN_NAME = /(\d+(?:[.,]\d+)?)\s*AH\b/i;
/** Energy packs: batteries and a charger sold under a model root. */
const ENERGY_PACK = /^(M12|M18)\s+H?NRG/;

const num = (s: string) => Number(s.replace(",", "."));

/** A loose battery: its capacity in Ah, or null when the line is not one. */
export function batteryOf(line: Pick<OwnedLine, "name" | "platform" | "modelRoot">): number | null {
  if (!isPlatform(line.platform) || line.modelRoot) return null;
  const text = normalizeModelText(line.name.toUpperCase());
  const code = BATTERY_CODE.exec(text);
  if (code) return num(code[1]);
  if (BATTERY_WORD.test(text)) {
    const ah = AH_IN_NAME.exec(text);
    return ah ? num(ah[1]) : 0;
  }
  return null;
}

/** The batteries in one kit: the manufacturer's block first, the model suffix second. */
export function kitBatteries(line: Pick<OwnedLine, "name" | "description">): { count: number; ah: number } | null {
  const block = kitFromTechBlock(parseTechBlock(line.description));
  if (block) return { count: block.batteries, ah: block.ah };
  const model = parseModel(line.name);
  return model?.kit ? { count: model.kit.batteries, ah: model.kit.ah } : null;
}

export function myTools(lines: OwnedLine[]): PlatformTools[] {
  type Acc = {
    tools: Map<string, { name: string; image: string | null; quantity: number }>;
    batteries: number;
    capacities: Set<number>;
    batteryTile: { name: string; image: string | null } | null;
  };
  const acc = new Map<Platform, Acc>();
  const get = (p: Platform) => {
    let a = acc.get(p);
    if (!a) {
      a = { tools: new Map(), batteries: 0, capacities: new Set(), batteryTile: null };
      acc.set(p, a);
    }
    return a;
  };

  for (const line of lines) {
    if (!isPlatform(line.platform) || line.quantity <= 0) continue;
    const a = get(line.platform);

    const ah = batteryOf(line);
    if (ah != null) {
      a.batteries += line.quantity;
      if (ah > 0) a.capacities.add(ah);
      // The first battery with a picture stands for all of them.
      if (!a.batteryTile || (!a.batteryTile.image && line.image)) {
        a.batteryTile = { name: line.name, image: line.image };
      }
      continue;
    }

    const isPack = line.modelRoot != null && ENERGY_PACK.test(line.modelRoot);
    const isKit = line.modelContent === "kit" || isPack;
    if (isKit) {
      const kit = kitBatteries(line);
      if (kit) {
        a.batteries += kit.count * line.quantity;
        a.capacities.add(kit.ah);
      }
    }
    if (isPack || !line.modelRoot) continue;

    const tool = a.tools.get(line.modelRoot);
    if (tool) {
      tool.quantity += line.quantity;
      if (!tool.image && line.image) tool.image = line.image;
    } else {
      a.tools.set(line.modelRoot, { name: line.name, image: line.image, quantity: line.quantity });
    }
  }

  return PLATFORM_ORDER.filter((p) => {
    const a = acc.get(p);
    return a && (a.tools.size > 0 || a.batteries > 0);
  }).map((platform) => {
    const a = acc.get(platform)!;
    const tools = [...a.tools.values()];
    const room = a.batteryTile ? 2 : 3;
    const thumbs: OwnedThumb[] = tools.slice(0, room).map((t) => ({
      kind: "tool",
      name: t.name,
      image: t.image,
      count: t.quantity > 1 ? t.quantity : null,
    }));
    if (a.batteryTile) {
      thumbs.push({ kind: "battery", ...a.batteryTile, count: a.batteries });
    }
    return {
      platform,
      tools: tools.length,
      batteries: a.batteries,
      capacities: [...a.capacities].sort((x, y) => y - x),
      thumbs,
      tip: a.batteries > 0 ? (tools.length > 0 ? "bare" : "tools") : null,
    };
  });
}
