import { listingRenderStats } from "@/lib/server/render-gate";

/**
 * Ο έλεγχος υγείας του container — liveness: μπορεί αυτή η διεργασία να
 * απαντήσει σε ένα αίτημα HTTP;
 *
 * ── Γιατί όχι η αρχική σελίδα ─────────────────────────────────────────────
 *
 * Ο έλεγχος ζητούσε ολόκληρη την αρχική, με όριο 5″. Η αρχική διαβάζει
 * κατηγορίες, μενού, μάρκες, προτεινόμενα και στατιστικά μέσα από το
 * `unstable_cache` — και αυτή η cache ζει στον δίσκο του container, άρα
 * ΣΒΗΝΕΤΑΙ σε κάθε επανεκκίνηση. Η πρώτη αρχική μετά από restart χτίζεται από το
 * μηδέν· αν αργήσει πάνω από 5″, ο έλεγχος αποτυγχάνει, η πλατφόρμα ξαναξεκινά
 * το container, η cache αδειάζει ξανά. Φαύλος κύκλος: ένα eshop που δούλευε
 * μέρες δεν μπορεί να ξανασηκωθεί από τη στιγμή που θα πέσει μία φορά.
 * Έτσι έπεσε στις 22/9/2026 — Traefik «no available server», ενώ το container
 * άνοιγε διαρκώς νέες συνδέσεις στη βάση (25 σε 4 λεπτά).
 *
 * ── Γιατί ούτε η βάση ─────────────────────────────────────────────────────
 *
 * Έκανε `SELECT 1`. Την 1/10/2026 ένα scraper κράτησε 140+ φιλτραρισμένα
 * renders καταλόγου σε εξέλιξη στο Kolleris eshop, από το οποίο αντιγράφηκε
 * αυτό: το event loop και το pool συνδέσεων ήταν πίσω τους στην ουρά, το
 * `SELECT 1` περίμενε τη σειρά του, ο έλεγχος των 10″ έληξε και το Traefik
 * έβγαλε το container από την κυκλοφορία — «no available server» για όλους,
 * ενώ η βάση καθόταν άεργη. Ένας έλεγχος ζωής που εξαρτάται από κοινόχρηστο
 * πόρο κάνει την ουρά εκείνου του πόρου διακοπή λειτουργίας.
 *
 * Οπότε απαντά από τη μνήμη και μόνο: αν η διεργασία μπορεί να τρέξει αυτόν
 * τον χειριστή, ζει. Αν απαντά η βάση είναι άλλη ερώτηση, του `/api/ready` —
 * για ανθρώπους και monitoring, όχι για τον βρόχο επανεκκίνησης.
 *
 * ── Γιατί παραμένει route ─────────────────────────────────────────────────
 *
 * Περνά από τον χειριστή αιτημάτων του Next, γιατί ένας server που έχει σπάσει
 * μέσα στον χειριστή δέχεται ακόμη συνδέσεις. Δημόσια λέει μόνο ότι ζει· τη
 * μνήμη heap και την πύλη των renders καταλόγου — τους δύο αριθμούς που θα
 * εξηγούσαν ένα τέτοιο περιστατικό με μια ματιά — τους γράφει στο log.
 */

export const dynamic = "force-dynamic";

/*
 * Heap and render-gate numbers go to the log, not the public body: at most
 * once every five minutes, and at once when the gate has refused renders since
 * the last line. The check runs every 30 s; a line each time would be noise.
 */
const LOG_EVERY_MS = 5 * 60_000;
let lastLogAt = 0;
let lastRefused = -1;

function logVitals(): void {
  const gate = listingRenderStats();
  const now = Date.now();
  if (now - lastLogAt < LOG_EVERY_MS && gate.refused === lastRefused) return;
  lastLogAt = now;
  lastRefused = gate.refused;
  const heapMb = Math.round(process.memoryUsage().heapUsed / 1_048_576);
  console.log(
    `[health] heap ${heapMb} MB; listing renders active ${gate.active}/${gate.max}, ` +
      `waiting ${gate.waiting}, refused ${gate.refused}`,
  );
}

export function GET() {
  logVitals();
  return Response.json(
    { ok: true, uptimeS: Math.round(process.uptime()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
