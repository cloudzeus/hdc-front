import "server-only";
import { prisma } from "@/lib/prisma";
import { sendOrderEmail } from "@/lib/mail/order-email";
import { sendInternalOrderEmail } from "@/lib/mail/order-internal-email";
import { sendOrderToErp, syncPaymentToErp, type SendToErpResult } from "@/lib/orders/send-to-erp";
import { requestBlocksPayment } from "@/lib/requests/model";

/**
 * Τι γίνεται αφού μια παραγγελία γίνει ΠΛΗΡΩΜΕΝΗ — από όπου κι αν ήρθαν τα χρήματα.
 * ─────────────────────────────────────────────────────────────────────────────
 * Ζούσε μέσα στο webhook της Viva, γιατί αυτός ήταν ο μόνος δρόμος προς το
 * PAID. Η HDC-20261028-0001 έδειξε ότι δεν αρκεί: ο πελάτης κατέθεσε 1.287,96 €
 * με αιτιολογία το IBAN αντί για τον κωδικό, η Viva δεν μπορούσε να την
 * ταιριάξει, και η παραγγελία έμεινε για πάντα «Αναμένεται πληρωμή» — χωρίς
 * απόδειξη, χωρίς HDCtool, χωρίς παραστατικό, και χωρίς κανένα κουμπί που να
 * το διορθώνει.
 *
 * Ένα σημείο για τα επόμενα βήματα σημαίνει ότι η χειροκίνητη καταχώρηση δεν
 * μπορεί να ξεχάσει κάτι που κάνει η αυτόματη.
 *
 * Τίποτα εδώ δεν ρίχνει: τα χρήματα έχουν ήδη κινηθεί. Κάθε αποτυχία
 * καταγράφεται και επιστρέφεται, ώστε όποιος πάτησε το κουμπί να τη δει.
 */
export async function afterPaymentCaptured(
  orderNumber: string,
  source: string,
): Promise<{ erp: SendToErpResult; problems: string[] }> {
  const problems: string[] = [];

  // «payment»: παραγγελία που ήδη επιβεβαιώθηκε με email (κατάθεση, διόρθωση
  // μεταφορικών) παίρνει την απόδειξη πληρωμής, όχι ολόκληρη την παραγγελία ξανά.
  const mail = await sendOrderEmail(orderNumber, { trigger: "payment" });
  if (!mail.ok) problems.push(`απόδειξη: ${mail.error}`);

  const internal = await sendInternalOrderEmail(orderNumber);
  if (!internal.ok) problems.push(`email καταστήματος: ${internal.error}`);

  const synced = await syncPaymentToErp(orderNumber);
  if (!synced.ok) problems.push(`HDCtool: ${synced.error}`);

  const erp = await sendOrderToErp(orderNumber);
  if (erp.ok) {
    console.log(
      `[${source}] ${orderNumber} → SoftOne ${erp.fincode ?? erp.findoc ?? "—"}${erp.alreadySent ? " (υπήρχε ήδη)" : ""}`,
    );
  } else {
    problems.push(`SoftOne (${erp.stage}): ${erp.error}`);
  }

  for (const p of problems) console.error(`[${source}] ${orderNumber} ${p}`);
  return { erp, problems };
}

export type BankPaymentInput = {
  orderNumber: string;
  /** Η ημερομηνία που πιστώθηκε ο λογαριασμός — από το extrait, όχι «τώρα». */
  paidAt: Date;
  /** Αριθμός συναλλαγής της τράπεζας ή ό,τι ταυτίζει την κίνηση. */
  reference: string;
  /** Ό,τι χρειάζεται να ξέρει ο επόμενος: «αιτιολογία το IBAN», «πλήρωσε ο λογιστής». */
  note?: string;
  /** Ο χειριστής επιβεβαίωσε ότι το ποσό που μπήκε είναι ακριβώς το σύνολο. */
  amountConfirmed: boolean;
  /** «admin:<email>». */
  actor: string;
};

export type BankPaymentResult =
  | { ok: true; erp: SendToErpResult; problems: string[] }
  | { ok: false; error: string };

/** Ποιες παραγγελίες δέχονται χειροκίνητη καταχώρηση κατάθεσης. Και η σελίδα τη ρωτά. */
export function canRecordBankPayment(order: {
  paymentStatus: string;
  status: string;
  requestStatus?: string | null;
}): boolean {
  if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") return false;
  if (order.status === "CANCELLED") return false;
  // Αίτημα κατόπιν παραγγελίας: πληρώνεται μόνο αφού ο πελάτης αποδεχτεί την πρόταση.
  return !requestBlocksPayment(order.requestStatus);
}

/**
 * «Καταχώρηση πληρωμής κατάθεσης» — όταν τα χρήματα ήρθαν αλλά η Viva δεν τα
 * αναγνώρισε (λάθος αιτιολογία, ληγμένος κωδικός, κατάθεση σε άλλο λογαριασμό).
 *
 * Δέχεται και παραγγελία που ξεκίνησε ως «κάρτα»: ένας πελάτης που τελικά
 * πλήρωσε με μεταφορά πρέπει να φτάσει στο SoftOne με τον κωδικό πληρωμής της
 * μεταφοράς, όχι της κάρτας. Γι' αυτό η μέθοδος γίνεται `bank` και το λέει το
 * ιστορικό.
 */
export async function recordBankPayment(input: BankPaymentInput): Promise<BankPaymentResult> {
  const reference = input.reference.trim();
  const note = input.note?.trim() ?? "";
  if (!input.amountConfirmed) {
    return { ok: false, error: "Επιβεβαιώστε ότι το ποσό που πιστώθηκε είναι ακριβώς το σύνολο της παραγγελίας." };
  }
  if (!reference) return { ok: false, error: "Γράψτε τον αριθμό συναλλαγής της τράπεζας." };
  if (Number.isNaN(input.paidAt.getTime())) return { ok: false, error: "Μη έγκυρη ημερομηνία πίστωσης." };
  if (input.paidAt.getTime() > Date.now() + 60_000) {
    return { ok: false, error: "Η ημερομηνία πίστωσης δεν μπορεί να είναι στο μέλλον." };
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber: input.orderNumber },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      requestStatus: true,
      totalGross: true,
      createdAt: true,
    },
  });
  if (!order) return { ok: false, error: "Η παραγγελία δεν βρέθηκε." };
  if (order.paymentStatus === "PAID") return { ok: false, error: "Η παραγγελία είναι ήδη πληρωμένη." };
  if (!canRecordBankPayment(order)) {
    return {
      ok: false,
      error: requestBlocksPayment(order.requestStatus)
        ? "Αίτημα κατόπιν παραγγελίας: ο πελάτης πρέπει πρώτα να αποδεχτεί την πρόταση."
        : "Η παραγγελία δεν δέχεται καταχώρηση πληρωμής σε αυτή την κατάσταση.",
    };
  }
  if (input.paidAt.getTime() < order.createdAt.getTime() - 24 * 3_600_000) {
    return { ok: false, error: "Η ημερομηνία πίστωσης είναι πριν από την παραγγελία." };
  }

  const switched = order.paymentMethod !== "bank";
  const detail = [
    `Κατάθεση ${Number(order.totalGross).toFixed(2)} € καταχωρήθηκε χειροκίνητα`,
    `πίστωση ${input.paidAt.toISOString().slice(0, 10)}`,
    `συναλλαγή τράπεζας ${reference}`,
    switched ? `μέθοδος ${order.paymentMethod} → bank` : null,
    note || null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Υπό όρο, όχι «διάβασε-γράψε»: δύο χειριστές ή ένα webhook της Viva την ίδια
  // στιγμή δεν πρέπει να γράψουν δύο πληρωμές.
  const { count } = await prisma.order.updateMany({
    where: { id: order.id, paymentStatus: { notIn: ["PAID", "REFUNDED"] } },
    data: {
      status: "CONFIRMED",
      paymentStatus: "PAID",
      paidAt: input.paidAt,
      paymentMethod: "bank",
      // Ο αριθμός Viva δεν έχει νόημα για χρήματα που δεν πέρασαν από τη Viva.
      vivaPaymentMethodId: null,
    },
  });
  if (count === 0) return { ok: false, error: "Η παραγγελία πληρώθηκε στο μεταξύ." };

  await prisma.orderStatusHistory.create({
    data: { orderId: order.id, status: "CONFIRMED", actor: input.actor.slice(0, 64), note: detail.slice(0, 1000) },
  });

  const after = await afterPaymentCaptured(input.orderNumber, "bank-payment");
  return { ok: true, ...after };
}
