"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Database, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  WITHDRAWAL_CONSENT,
  type ErpPreviewOk,
  type ErpRegisterOk,
} from "@/lib/hdctool/milwaukee-admin-contract";
import { milwaukeeErpPreview, milwaukeeRegisterInErp } from "../actions";
import { attempt, type Result } from "./format";
import { Notice, Tag } from "./kit";

type Preview = Result<ErpPreviewOk>;
type Outcome = Result<ErpRegisterOk>;

type Stage =
  | { step: "loading" }
  | { step: "preview"; preview: Preview }
  | { step: "sending"; preview: Preview }
  | { step: "done"; result: Outcome };

/**
 * «Καταχώριση στο SoftOne»: πρώτα η προεπισκόπηση του HDCtool — το ακριβές
 * payload του `setData`, ή το υπάρχον είδος και τι θα αλλάξει — και μετά η
 * αποστολή με το αποτύπωμα (`fingerprint`) της ίδιας προεπισκόπησης: αν κάτι
 * άλλαξε στο μεταξύ, το HDCtool αρνείται. Θέλει `milwaukee.erp` στον server.
 */
export function ErpRegisterDialog({
  itemId,
  blockers,
  disabledReason,
  onDone,
}: {
  itemId: string;
  blockers: string[];
  /** Άλλος λόγος να μείνει ανενεργό (π.χ. αλλαγές που δεν αποθηκεύτηκαν). */
  disabledReason: string | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ step: "loading" });
  const [consent, setConsent] = useState(false);
  const reason = disabledReason ?? (blockers.length > 0 ? blockers.join(" · ") : null);

  const start = async () => {
    setOpen(true);
    setConsent(false);
    setStage({ step: "loading" });
    setStage({ step: "preview", preview: await attempt<ErpPreviewOk>(() => milwaukeeErpPreview(itemId)) });
  };

  const send = async (preview: Preview) => {
    if (!preview.ok) return;
    setStage({ step: "sending", preview });
    const result = await attempt<ErpRegisterOk>(() =>
      milwaukeeRegisterInErp(itemId, {
        fingerprint: preview.fingerprint,
        ...(preview.mode === "create" ? { code: preview.code } : { acceptWithdrawal: consent }),
      }),
    );
    setStage({ step: "done", result });
    if (result.ok) {
      toast.success(
        result.mode === "created" ? `Δημιουργήθηκε στο SoftOne: MTRL ${result.mtrl}` : `Συνδέθηκε με MTRL ${result.mtrl}`,
      );
      onDone();
    } else {
      toast.error(result.error);
    }
  };

  const preview = stage.step === "preview" || stage.step === "sending" ? stage.preview : null;
  const needsConsent = preview?.ok === true && preview.mode === "link" && preview.incomplete.length > 0;

  return (
    <>
      <Button type="button" variant="outline" disabled={reason != null} title={reason ?? undefined} onClick={() => void start()}>
        <Database className="size-4" aria-hidden />
        Καταχώριση στο SoftOne
      </Button>
      <Dialog open={open} onOpenChange={(o) => stage.step !== "sending" && setOpen(o)}>
        <DialogContent size="wide" className="max-h-[90vh] overflow-y-auto rounded-none border-k-line">
          <DialogHeader>
            <DialogTitle>Καταχώριση στο SoftOne</DialogTitle>
            <DialogDescription>
              Δημιουργία του είδους στο SoftOne (ή σύνδεση, αν υπάρχει ήδη με τον ίδιο κωδικό Milwaukee). Χωρίς παραγγελία
              αγοράς.
            </DialogDescription>
          </DialogHeader>

          {stage.step === "loading" && (
            <p className="flex items-center gap-2 text-[length:var(--fs-12-5)] text-k-text-3">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Αναζήτηση στο SoftOne…
            </p>
          )}

          {preview && !preview.ok && (
            <Notice tone="danger">
              <p>{preview.error}</p>
              {preview.blockers && preview.blockers.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {preview.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </Notice>
          )}

          {preview?.ok && <PreviewView preview={preview} consent={consent} onConsent={setConsent} />}

          {stage.step === "sending" && (
            <p className="flex items-center gap-2 text-[length:var(--fs-12-5)] text-k-text-3">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Αποστολή, ανάγνωση και ενημέρωση του eshop… (έως 5 λεπτά)
            </p>
          )}

          {stage.step === "done" && <ErpResultView result={stage.result} />}

          <DialogFooter>
            {stage.step === "done" ? (
              <Button type="button" onClick={() => setOpen(false)}>
                Κλείσιμο
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" disabled={stage.step === "sending"} onClick={() => setOpen(false)}>
                  Άκυρο
                </Button>
                <Button
                  type="button"
                  disabled={!preview?.ok || stage.step === "sending" || (needsConsent && !consent)}
                  onClick={() => preview && void send(preview)}
                >
                  {stage.step === "sending" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Database className="size-4" aria-hidden />
                  )}
                  {preview?.ok && preview.mode === "link" ? "Σύνδεση" : "Αποστολή στο SoftOne"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Η προεπισκόπηση όπως ήρθε από το HDCtool, χωρίς διασκευή. */
function PreviewView({
  preview,
  consent,
  onConsent,
}: {
  preview: ErpPreviewOk;
  consent: boolean;
  onConsent: (on: boolean) => void;
}) {
  return (
    <div className="min-w-0 space-y-3 text-[length:var(--fs-12-5)]">
      {preview.notes.map((n) => (
        <Notice key={n} tone="info">
          {n}
        </Notice>
      ))}

      {preview.mode === "create" ? (
        <>
          <p>
            Νέο είδος με κωδικό <span className="font-mono font-semibold">{preview.code}</span>. Αυτό ακριβώς θα σταλεί
            (setData):
          </p>
          <pre
            className="max-h-96 overflow-y-auto border border-k-line bg-k-surface-3 p-2 font-mono text-[length:var(--fs-12)] break-all whitespace-pre-wrap"
            aria-label="Payload του setData"
          >
            {JSON.stringify(preview.payload, null, 2)}
          </pre>
          <p className="text-[length:var(--fs-12)] text-k-text-3">
            Μετά την αποστολή το είδος διαβάζεται πίσω από το SoftOne· αν κάτι δεν γράφτηκε, δεν σημειώνεται τίποτα
            τοπικά.
          </p>
        </>
      ) : (
        <>
          <p>
            Υπάρχει ήδη στο SoftOne: <b>MTRL {preview.mtrl}</b>. Θα συνδεθεί με αυτό, χωρίς νέο είδος.
          </p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border border-k-line p-2.5 text-[length:var(--fs-12)]">
            <dt className="text-k-text-3">CODE</dt>
            <dd className="font-mono break-all">{preview.erp.code || "—"}</dd>
            <dt className="text-k-text-3">NAME</dt>
            <dd className="break-words">{preview.erp.name || "—"}</dd>
            <dt className="text-k-text-3">PRICEW</dt>
            <dd className="numeral">{preview.erp.priceW ?? "—"}</dd>
            <dt className="text-k-text-3">Κατηγορία / ομάδα / υποομάδα</dt>
            <dd className="numeral">
              {preview.erp.mtrcategory ?? "—"} / {preview.erp.mtrgroup ?? "—"} / {preview.erp.cccSubgroup2 ?? "—"}
            </dd>
            <dt className="text-k-text-3">BOOL01 (eshop)</dt>
            <dd>{preview.erp.bool01 ?? "—"}</dd>
            <dt className="text-k-text-3">ISACTIVE</dt>
            <dd>{preview.erp.isActive ?? "—"}</dd>
          </dl>
          <p className="font-medium">Τι θα αλλάξει:</p>
          <ul className="list-disc pl-5 text-[length:var(--fs-12)]">
            <li>το προϊόν μόνο-XML συνδέεται με το MTRL {preview.mtrl} και δεν δημοσιεύεται πια ξεχωριστά</li>
            {preview.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
            {preview.changes.length === 0 && preview.incomplete.length === 0 && <li>τίποτα στο SoftOne</li>}
          </ul>
          {preview.incomplete.length > 0 && (
            <Notice tone="warn">
              <p className="flex items-start gap-1.5">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Το είδος του SoftOne είναι {preview.incomplete.join(", ")}: δεν θα δημοσιευτεί.
              </p>
              <div className="mt-2 flex items-start gap-2">
                <Checkbox id="erp-consent" checked={consent} onCheckedChange={(v) => onConsent(v === true)} />
                <Label htmlFor="erp-consent" className="cursor-pointer text-[length:var(--fs-12)] leading-snug">
                  {WITHDRAWAL_CONSENT}
                </Label>
              </div>
            </Notice>
          )}
        </>
      )}

      <p className="flex flex-wrap items-center gap-2 text-[length:var(--fs-12)] text-k-text-3">
        {preview.publish ? <Tag tone="ok">θα δημοσιευτεί στο eshop</Tag> : <Tag>χωρίς δημοσίευση στο eshop</Tag>}
        <span className="min-w-0 break-all font-mono" title={preview.fingerprint}>
          αποτύπωμα {preview.fingerprint.slice(0, 12)}…
        </span>
      </p>
    </div>
  );
}

/** Το αποτέλεσμα μιας καταχώρισης: MTRL, eshop, ειδοποιήσεις, ή το σφάλμα όπως ήρθε. */
export function ErpResultView({ result }: { result: Outcome }) {
  if (!result.ok) {
    return (
      <Notice tone="danger">
        {result.error}
        {result.mtrl != null && ` (MTRL ${result.mtrl} — ελέγξτε το στο SoftOne)`}
      </Notice>
    );
  }
  return (
    <div className="space-y-2 text-[length:var(--fs-12-5)]">
      <p className="flex items-center gap-2 font-medium text-k-ink">
        <CheckCircle2 className="size-4 text-[var(--hdc-ok)]" aria-hidden />
        {result.mode === "created" ? "Δημιουργήθηκε" : "Συνδέθηκε"}: MTRL {result.mtrl} · κωδικός {result.code || "—"}
      </p>
      {result.alerts.length > 0 && (
        <Notice tone="danger">
          {result.alerts.map((a, i) => (
            <p key={i} className="flex items-start gap-1.5 font-medium">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {a}
            </p>
          ))}
        </Notice>
      )}
      <p className="text-k-text-3">{result.eshopListed ? "Φαίνεται στο eshop ως είδος του ERP." : "Δεν φαίνεται στο eshop."}</p>
      {result.warnings.length > 0 && (
        <ul className="list-disc pl-5 text-[length:var(--fs-12)] text-[var(--hdc-wait)]">
          {result.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
