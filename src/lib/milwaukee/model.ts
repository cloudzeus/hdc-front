/**
 * What a Milwaukee product name says about the product (spec §8.1–8.3).
 *
 * The names come from the ERP and are not tidy: 42 of 2.864 glue the platform
 * to the model ("M18FPD3-502X"), some write the platform with a Greek Μ ("Μ18"),
 * some carry double spaces. Everything here normalises first.
 */

export type Platform = "M12" | "M18" | "MX";

export type ParsedModel = {
  platform: Platform;
  /** "M18 FPD3" — the bare tool and every kit of it share this. */
  root: string;
  /** "M18 FPD3-502X" */
  code: string;
  content: "bare" | "kit";
  /** From the suffix, only when unambiguous. The description is the better source. */
  kit: { batteries: number; ah: number } | null;
  fuel: boolean;
  oneKey: boolean;
};

/** Greek capitals that look like Latin ones, inside tokens that also hold a digit. */
const LOOKALIKE: Record<string, string> = {
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
};

// Input is expected uppercase — ERP names come uppercase already, so no case
// folding is done here.
export function normalizeModelText(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((token) =>
      // Only tokens with a digit are model codes; «ΜΠΑΤΑΡΙΑ» must stay Greek.
      /\d/.test(token) ? token.replace(/[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]/g, (c) => LOOKALIKE[c] ?? c) : token,
    )
    .join(" ")
    // "M18FPD3-502X" → "M18 FPD3-502X"; "M18-FPD" (a chuck FOR the FPD) is left alone.
    .replace(/\b(M12|M18)(?=[A-Z])/g, "$1 ");
}

export function platformOf(name: string): Platform | null {
  const text = normalizeModelText(name);
  if (/\bMX\s?FUEL\b|\bMXF\b/.test(text)) return "MX";
  if (/\bM18\b/.test(text)) return "M18";
  if (/\bM12\b/.test(text)) return "M12";
  return null;
}

/** Battery capacities Milwaukee sells, as they appear in kit suffixes. */
const KNOWN_AH = new Set([2, 3, 4, 5, 6, 8, 12]);

/**
 * Tool code: platform, space, a model starting with a letter, a dash, and a
 * suffix — 0 / 0X / 0C for the bare tool, digits (+ case letter) for a kit.
 * MX FUEL is written «MXF» by the ERP («MXF DCD150-302C», «MXF PBE-0»).
 */
const CODE = /\b(M12|M18|MXF)\s([A-Z][A-Z0-9]*)-(\d{1,3}[A-Z]?)\b/;

export function parseModel(name: string): ParsedModel | null {
  const text = normalizeModelText(name);
  const match = CODE.exec(text);
  if (!match) return null;
  const [, prefix, model, suffix] = match as unknown as [string, "M12" | "M18" | "MXF", string, string];
  const platform: Platform = prefix === "MXF" ? "MX" : prefix;

  const digits = suffix.replace(/[A-Z]$/, "");
  const bare = digits === "0";

  let kit: ParsedModel["kit"] = null;
  // Every real kit suffix is (2-digit capacity)(1-digit count) — 202, 402, 502,
  // 602, 802, 121, 122 — so only a 3-digit suffix can be a kit reading; a
  // 2-digit suffix like "-32" is not a kit and must not become {batteries:2, ah:3}.
  if (!bare && digits.length === 3) {
    const batteries = Number(digits.slice(-1));
    const ahDigits = Number(digits.slice(0, -1));
    // Milwaukee writes sub-10Ah capacities in tenths ("50" = 5.0Ah) but 10Ah+
    // capacities literally ("12" = 12Ah) — try the literal reading first,
    // since a literal match is never also a valid /10 match in KNOWN_AH.
    const ah = KNOWN_AH.has(ahDigits) ? ahDigits : ahDigits / 10;
    if (batteries >= 1 && batteries <= 3 && Number.isInteger(ah) && KNOWN_AH.has(ah)) kit = { batteries, ah };
  }

  return {
    platform,
    root: `${prefix} ${model}`,
    code: `${prefix} ${model}-${suffix}`,
    content: bare ? "bare" : "kit",
    kit,
    // Everything MX is MX FUEL.
    fuel: platform === "MX" || /^(ONE)?F/.test(model) || /\bFUEL\b/.test(text),
    oneKey: model.startsWith("ONE"),
  };
}
