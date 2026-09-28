import { parseModel, platformOf } from "@/lib/milwaukee/model";

/**
 * How a Milwaukee product is labelled on a card (mockup design-system.html,
 * "ΚΑΡΤΑ ΠΡΟΪΟΝΤΟΣ"): a clean name without the article number in it, and a
 * slanted tag naming the battery platform.
 */

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The product name as a card prints it.
 *
 * ERP names carry the article number and often the brand at the end
 * ("... M18 FRGRO114-0C 4933479788 MILWAUKEE"). On a Milwaukee-only shop the
 * brand says nothing, and the card prints the article number on its own line
 * already. So both go, the platform glued to a model is split
 * ("M18FPD3" → "M18 FPD3"), a Greek Μ in front of 12/18 becomes a Latin M, and
 * runs of spaces collapse.
 *
 * `code` is the manufacturer code (code2); when given, it is removed wherever
 * it stands as a word — the Italian names put it in the middle. Without it,
 * only a trailing ten-digit article number is removed.
 */
export function displayName(name: string, code?: string | null): string {
  const original = name.replace(/\s+/g, " ").trim();
  let text = original;

  if (code && code.trim()) {
    text = text.replace(new RegExp(`(^|\\s)${escapeRegExp(code.trim())}(?=\\s|$)`, "g"), " ");
  }

  text = text
    .replace(/(^|\s)MILWAUKEE(?=\s|$|®|™)[®™]?/gi, " ")
    .replace(/(^|\s)Μ(12|18)(?=[\s\-A-Z]|$)/g, "$1M$2")
    .replace(/\b(M12|M18)(?=[A-Z])/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim()
    // a trailing article number, possibly repeated ("... 4933479859 4933479859")
    .replace(/(\s\d{10})+$/, "")
    .replace(/[\s,;·–-]+$/, "")
    .trim();

  return text || original;
}

/**
 * The platform tag on a card: "M18 FUEL", "M12", "MX FUEL" — or null for
 * products that belong to no platform (hand tools, PACKOUT, workwear).
 */
export function platformTag(name: string): string | null {
  const platform = platformOf(name);
  if (!platform) return null;
  if (platform === "MX") return "MX FUEL";
  const fuel = parseModel(name)?.fuel ?? /\bFUEL\b/i.test(name);
  return fuel ? `${platform} FUEL` : platform;
}
