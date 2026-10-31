"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Database, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pushOrderToErp, recordOrderBankPayment } from "@/app/admin/(protected)/orders/actions";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** «2026-10-31» στην ώρα Ελλάδας — η προεπιλογή του πεδίου ημερομηνίας. */
const todayAthens = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" });

/**
 * Οι δύο ενέργειες που έλειπαν από τη σελίδα της παραγγελίας.
 *
 * «Καταχώρηση πληρωμής κατάθεσης»: για χρήματα που ήρθαν χωρίς να τα
 * ταυτίσει η Viva. Ζητά ημερομηνία πίστωσης, αριθμό συναλλαγής και ρητή
 * επιβεβαίωση του ποσού — καταχωρεί χρήματα, δεν είναι κουμπί για βιαστικούς.
 *
 * «Αποστολή στο SoftOne»: το ίδιο με τη λίστα, εδώ όπου κοιτάζει κανείς
 * όταν κάτι πήγε στραβά.
 */
export function OrderPaymentActions({
  orderNumber,
  totalGross,
  canRecordPayment,
  canPushErp,
  paymentMethodLabel,
}: {
  orderNumber: string;
  totalGross: number;
  canRecordPayment: boolean;
  canPushErp: boolean;
  paymentMethodLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paidAt, setPaidAt] = useState(todayAthens);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [amountOk, setAmountOk] = useState(false);
  const [pending, start] = useTransition();
  const [pushing, startPush] = useTransition();

  if (!canRecordPayment && !canPushErp) return null;

  function save() {
    start(async () => {
      const result = await recordOrderBankPayment(orderNumber, {
        paidAt,
        reference,
        note,
        amountConfirmed: amountOk,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      if (result.erp.ok) {
        toast.success(
          `Η πληρωμή καταχωρήθηκε — SoftOne ${result.erp.fincode ?? result.erp.findoc ?? "ΟΚ"}`,
        );
      } else {
        toast.warning(`Η πληρωμή καταχωρήθηκε, αλλά το SoftOne απάντησε: ${result.erp.error}`);
      }
      for (const p of result.problems.filter((p) => !p.startsWith("SoftOne"))) toast.warning(p);
      router.refresh();
    });
  }

  function push() {
    startPush(async () => {
      const result = await pushOrderToErp(orderNumber);
      if (result.ok) {
        toast.success(
          result.alreadySent
            ? "Είχε ήδη σταλεί στο SoftOne"
            : `Στάλθηκε στο SoftOne — ${result.fincode ?? `FINDOC ${result.findoc}`}`,
        );
      } else {
        toast.error(result.error);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {canRecordPayment && (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Landmark className="size-3.5" />
          Καταχώρηση πληρωμής κατάθεσης
        </Button>
      )}
      {canPushErp && (
        <Button size="sm" onClick={push} disabled={pushing}>
          {pushing ? <Loader2 className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
          {pushing ? "Αποστολή…" : "Αποστολή στο SoftOne"}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Καταχώρηση πληρωμής · {orderNumber}</DialogTitle>
            <DialogDescription>
              Για κατάθεση που μπήκε στον λογαριασμό αλλά δεν ταυτίστηκε αυτόματα (λάθος αιτιολογία,
              ληγμένος κωδικός). Μετά την καταχώρηση στέλνεται απόδειξη στον πελάτη, ενημερώνεται το
              HDCtool και εκδίδεται το παραστατικό στο SoftOne.
              {paymentMethodLabel !== "Τραπεζική κατάθεση" &&
                ` Η μέθοδος πληρωμής θα αλλάξει από «${paymentMethodLabel}» σε τραπεζική κατάθεση.`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="paidAt">Ημερομηνία πίστωσης</Label>
              <Input id="paidAt" type="date" value={paidAt} max={todayAthens()} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reference">Αριθμός συναλλαγής τράπεζας</Label>
              <Input
                id="reference"
                value={reference}
                placeholder="π.χ. 20261029096786B348"
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="note">Σημείωση (προαιρετικά)</Label>
              <Textarea
                id="note"
                rows={2}
                value={note}
                placeholder="π.χ. αιτιολογία το IBAN, από Alpha Bank"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-2 text-[length:var(--fs-13)]">
              <Checkbox checked={amountOk} onCheckedChange={(v) => setAmountOk(v === true)} className="mt-0.5" />
              <span>
                Πιστώθηκε ακριβώς <strong className="numeral">{formatMoney(totalGross, "el")}</strong>, το σύνολο της
                παραγγελίας.
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Άκυρο
            </Button>
            <Button onClick={save} disabled={pending || !amountOk || !reference.trim() || !paidAt}>
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              Καταχώρηση
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
