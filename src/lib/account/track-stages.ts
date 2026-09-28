/**
 * The four stages of the «ΤΟ ΔΕΜΑ ΣΑΣ ΕΙΝΑΙ ΚΑΘ' ΟΔΟΝ» strip (account.html,
 * screen 2): ΠΑΡΑΛΗΦΘΗΚΕ · ΣΕ ΔΙΑΛΟΓΗ · ΣΕ ΔΙΑΝΟΜΗ · ΠΑΡΑΔΟΘΗΚΕ.
 *
 * ACS reports free-text checkpoints ("Παραλαβή από αποστολέα", "Άφιξη στο
 * κέντρο διαλογής", "Σε διανομή", "Παραδόθηκε"). They are read into stages by
 * a few keywords, and only ever forwards: a stage counts as reached when a
 * checkpoint names it or a later one. The furthest stage reached is `now` (red),
 * the ones before it `done` (white), the rest `todo`. With no checkpoints yet
 * the parcel is handed over and waiting: the first stage is `now`.
 *
 * «ΜΗ ΠΑΡΑΔΟΘΗΚΕ» contains «ΠΑΡΑΔΟΘΗΚΕ»; a failed attempt is a delivery
 * round, not a delivery.
 */

export type TrackCheckpoint = { at: string; status: string; place: string | null };

export type TrackStage = {
  key: "picked" | "sorting" | "delivering" | "delivered";
  state: "done" | "now" | "todo";
  /** The checkpoint that reached this stage, when there is one. */
  at: string | null;
  place: string | null;
};

const KEYS: TrackStage["key"][] = ["picked", "sorting", "delivering", "delivered"];

const fold = (s: string) =>
  s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function stageOf(status: string): number {
  const text = fold(status);
  if (/(^|[^Α-ΩA-Z])(ΜΗ|ΔΕΝ)\s+ΠΑΡΑΔΟΘ|ΑΠΟΠΕΙΡΑ|ΑΠΟΥΣΙΑ|NOT DELIVERED|ATTEMPT/.test(text)) return 2;
  if (/ΠΑΡΑΔΟΘ|ΠΑΡΑΔΟΣΗ ΣΕ ΠΑΡΑΛΗΠΤ|DELIVERED/.test(text)) return 3;
  if (/ΔΙΑΝΟΜ|ΔΙΑΝΟΜΕΑ|OUT FOR DELIVERY/.test(text)) return 2;
  if (/ΔΙΑΛΟΓ|ΚΕΝΤΡ|ΑΦΙΞΗ|ΑΝΑΧΩΡΗΣ|ΜΕΤΑΦΟΡ|HUB|TRANSIT|SORT/.test(text)) return 1;
  return 0;
}

export function trackStages(checkpoints: TrackCheckpoint[], delivered = false): TrackStage[] {
  const hits: Array<TrackCheckpoint | null> = [null, null, null, null];
  let reached = checkpoints.length > 0 ? 0 : -1;

  for (const checkpoint of checkpoints) {
    const stage = stageOf(checkpoint.status);
    // The later of two checkpoints for one stage, when both dates parse;
    // otherwise the first one ACS listed.
    const held = hits[stage];
    const later = held && Date.parse(checkpoint.at) > Date.parse(held.at);
    if (!held || later) hits[stage] = checkpoint;
    reached = Math.max(reached, stage);
  }
  if (delivered) reached = 3;
  const now = Math.max(reached, 0);

  return KEYS.map((key, i) => ({
    key,
    state: i < now || (delivered && i === 3) ? "done" : i === now ? "now" : "todo",
    at: hits[i]?.at ?? null,
    place: hits[i]?.place ?? null,
  }));
}
