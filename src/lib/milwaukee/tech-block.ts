/**
 * The manufacturer's spec lines at the end of a Milwaukee description.
 *
 * The English description carries the same block as «Technical specifications:»
 * (1.652 of the 1.832 products that have the Greek one), with the same numbers
 * and English labels, sometimes as "- " list lines. The PDP shows that one on
 * the English and Italian pages; every fact the code reasons about (kit
 * contents, key numbers) is still read from the Greek block.
 *
 * Why not HDCtool's `specifications[]`: that table was filled by AI and is
 * wrong for Milwaukee — for M18 FPD3-502X it says 135 Nm and 0–1800 rpm where
 * Milwaukee says 158 Nm and 0–2100 (spec §8.4). The "Τεχνικά χαρακτηριστικά:"
 * block in the Greek long description is Milwaukee's own data.
 */

export type TechRow = { label: string; value: string };

const HEADING = /(Τεχνικά χαρακτηριστικά|Technical specifications)\s*:\s*\n/i;

export function parseTechBlock(description: string | null | undefined): TechRow[] {
  if (!description) return [];
  const at = description.search(HEADING);
  if (at === -1) return [];

  return description
    .slice(at)
    .replace(HEADING, "")
    .split("\n")
    .map((line) => {
      const clean = line.replace(/\r$/, "");
      const i = clean.indexOf(":");
      if (i <= 0) return null;
      const label = clean.slice(0, i).replace(/^\s*[-–•]\s*/, "").trim();
      const value = clean.slice(i + 1).trim();
      // "-" is how the source says "not applicable" — a bare tool's battery rows.
      return label && value && value !== "-" ? { label, value } : null;
    })
    .filter((row): row is TechRow => row !== null);
}

/**
 * The source words the same line several ways: «Αρ. παρεχόμενων μπαταριών»,
 * «Αρ. Μπαταριών», «Αριθμός παρεχόμενων μπαταριών», «Αρ. των παρεχόμενων
 * μπαταριών», «Αριθμός μπαταριών που παρέχονται».
 */
const BATTERY_COUNT = /^(Αρ\.|Αριθμός)\s+(των\s+)?(παρεχόμενων\s+)?μπαταριών/i;
const BATTERY_AH = /^Χωρητικότητα μπαταρίας/i;

/** The first number in a value: "5.0", "5,0 Ah", "2 τεμ." */
const firstNumber = (value: string | undefined) => {
  const match = value?.match(/\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : NaN;
};

export function kitFromTechBlock(rows: TechRow[]): { batteries: number; ah: number } | null {
  const find = (label: RegExp) => rows.find((r) => label.test(r.label))?.value;
  const batteries = firstNumber(find(BATTERY_COUNT));
  const ah = firstNumber(find(BATTERY_AH));
  return Number.isFinite(batteries) && batteries > 0 && Number.isFinite(ah) && ah > 0
    ? { batteries, ah }
    : null;
}
