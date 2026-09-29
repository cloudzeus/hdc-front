import { NextRequest, NextResponse } from "next/server";
import { sweepOrders } from "@/lib/orders/delivery-sweep";

/**
 * Η σάρωση των παραγγελιών: παραστατικά που λείπουν, έλεγχος παραδόσεων ACS,
 * αιτήσεις αξιολόγησης.
 *
 * ── Τρέχει μόνη της ──────────────────────────────────────────────────────
 *
 * Κάθε 30 λεπτά μέσα στον server (`src/lib/cron/schedule.ts`), χωρίς καμία
 * ρύθμιση στον Coolify. Τα πολλαπλά αντίγραφα δεν τη διπλασιάζουν: κάθε
 * γύρος διεκδικείται στη βάση (`src/lib/cron/claim.ts`), και μόνο ένα
 * αντίγραφο τον παίρνει, οπότε κανένας πελάτης δεν λαμβάνει το ίδιο email δύο φορές.
 *
 * Αυτό το route μένει για χειροκίνητη εκτέλεση:
 *
 *     curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<shop>/api/cron/orders
 *
 * ── Χωρίς μυστικό, δεν τρέχει ────────────────────────────────────────────
 *
 * Αν το `CRON_SECRET` δεν έχει οριστεί, το endpoint απαντά 503 αντί να τρέξει
 * ανοιχτό. Μια σάρωση που στέλνει email σε πελάτες δεν είναι κάτι που αφήνεται
 * εκτεθειμένο επειδή ξεχάστηκε μια μεταβλητή.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET δεν είναι ρυθμισμένο." },
      { status: 503 },
    );
  }

  const offered = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (offered !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const report = await sweepOrders();

  /*
   * Τα σφάλματα επιστρέφονται ΚΑΙ καταγράφονται, αλλά η απάντηση μένει 200:
   * ένα voucher που δεν απάντησε δεν είναι λόγος να θεωρήσει ο χρονιστής ότι
   * απέτυχε ολόκληρο το πέρασμα και να το ξαναπαίξει από την αρχή.
   */
  if (report.errors.length > 0) {
    console.error(`[cron:orders] ${report.errors.length} σφάλματα`, report.errors);
  }
  console.info(
    `[cron:orders] παραστατικά ${report.documentsIssued} · ελέγχθηκαν ${report.checked} · ` +
      `παραδόθηκαν ${report.delivered} · αιτήσεις αξιολόγησης ${report.reviewsRequested}`,
  );

  return NextResponse.json({ ok: true, ...report });
}
