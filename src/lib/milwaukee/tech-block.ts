/**
 * The manufacturer's spec lines at the end of a Milwaukee description.
 *
 * Why not HDCtool's `specifications[]`: that table was filled by AI and is
 * wrong for Milwaukee — for M18 FPD3-502X it says 135 Nm and 0–1800 rpm where
 * Milwaukee says 158 Nm and 0–2100 (spec §8.4). The "Τεχνικά χαρακτηριστικά:"
 * block in the Greek long description is Milwaukee's own data.
 */

export type TechRow = { label: string; value: string };

const HEADING = /Τεχνικά χαρακτηριστικά:\s*\n/;

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
      const label = clean.slice(0, i).trim();
      const value = clean.slice(i + 1).trim();
      // "-" is how the source says "not applicable" — a bare tool's battery rows.
      return label && value && value !== "-" ? { label, value } : null;
    })
    .filter((row): row is TechRow => row !== null);
}

export function kitFromTechBlock(rows: TechRow[]): { batteries: number; ah: number } | null {
  const find = (prefix: string) => rows.find((r) => r.label.startsWith(prefix))?.value;
  const batteries = Number(find("Αρ. παρεχόμενων μπαταριών"));
  const ah = Number(find("Χωρητικότητα μπαταρίας")?.replace(",", "."));
  return Number.isFinite(batteries) && batteries > 0 && Number.isFinite(ah) && ah > 0
    ? { batteries, ah }
    : null;
}
