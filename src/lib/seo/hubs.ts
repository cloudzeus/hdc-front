import type { Platform } from "@/lib/milwaukee/model";

/**
 * The platform hubs: one page per way a Milwaukee customer thinks about the
 * range («I have M18 batteries»), plus the brand hub. Each is a PLATFORM
 * SeoOverride (docs/content/seo/platforms/<key>/el.md) over its automatic
 * text (messages `seoPages.hub_<msg>_*`).
 */
export const HUB_KEYS = ["milwaukee", "m18", "m12", "mx-fuel", "packout"] as const;
export type HubKey = (typeof HUB_KEYS)[number];

export type Hub = {
  key: HubKey;
  path: string;
  /** The battery platform the hub is about, if any. */
  platform: Platform | null;
  /** For PACKOUT: the word its products carry in their names. */
  nameFilter: string | null;
  /** The message-key stem: `seoPages.hub_<msg>_h1`. */
  msg: "milwaukee" | "m18" | "m12" | "mxfuel" | "packout";
  /** Short name, for crumbs and tiles. */
  label: string;
};

export const HUBS: Record<HubKey, Hub> = {
  milwaukee: { key: "milwaukee", path: "/milwaukee", platform: null, nameFilter: null, msg: "milwaukee", label: "Milwaukee" },
  m18: { key: "m18", path: "/milwaukee-m18", platform: "M18", nameFilter: null, msg: "m18", label: "Milwaukee M18" },
  m12: { key: "m12", path: "/milwaukee-m12", platform: "M12", nameFilter: null, msg: "m12", label: "Milwaukee M12" },
  "mx-fuel": { key: "mx-fuel", path: "/mx-fuel", platform: "MX", nameFilter: null, msg: "mxfuel", label: "Milwaukee MX FUEL" },
  packout: { key: "packout", path: "/packout", platform: null, nameFilter: "PACKOUT", msg: "packout", label: "Milwaukee PACKOUT" },
};

/** The hub of a battery platform. */
export function hubForPlatform(platform: Platform | null | undefined): Hub {
  return platform === "M18" ? HUBS.m18 : platform === "M12" ? HUBS.m12 : platform === "MX" ? HUBS["mx-fuel"] : HUBS.milwaukee;
}
