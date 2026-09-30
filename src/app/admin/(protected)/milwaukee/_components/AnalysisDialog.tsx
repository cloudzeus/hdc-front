"use client";

import { useRef, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AnalysisRawView } from "@/lib/hdctool/milwaukee-admin-contract";
import { read, when } from "./format";
import { LoadError, Notice, Tag } from "./kit";

type Trace = {
  at?: string;
  path?: "xml" | "official";
  model?: string | null;
  usage?: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null } | null;
  inventory?: { segments: Array<{ id: string; text: string }>; specs: Array<{ id: string; label: string; value: string }> };
  officialLabels?: string[];
  response?: unknown;
  responseError?: string | null;
  selected?: { features: string[]; specs: string[]; exclude: string[] } | null;
  names?: { en: string | null; it: string | null; acceptedEn: string | null; acceptedIt: string | null } | null;
  dropped?: string[];
  error?: string | null;
  truncated?: boolean;
};

/** «Απάντηση DeepSeek»: τι στάλθηκε, τι απάντησε και τι κρατήθηκε στην τελευταία ανάλυση. */
export function AnalysisDialog({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AnalysisRawView | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Κάθε άνοιγμα/κλείσιμο αλλάζει τη «συνεδρία»: παλιές απαντήσεις αγνοούνται.
  const session = useRef(0);

  /** Φόρτωση όταν ανοίγει ο διάλογος και με το «Ξανά». */
  const load = async () => {
    const token = ++session.current;
    setData(null);
    setError(null);
    const r = await read<{ analysis: AnalysisRawView }>("analysis", itemId);
    if (token !== session.current) return;
    if (r.ok) setData(r.analysis);
    else setError(r.error);
  };

  const show = () => {
    setOpen(true);
    void load();
  };

  const onOpenChange = (o: boolean) => {
    if (!o) session.current++;
    setOpen(o);
  };

  const trace = (data?.analysisRaw ?? null) as Trace | null;

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={show}>
        <Bot className="size-4" aria-hidden />
        Απάντηση DeepSeek
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="wide" className="max-h-[90vh] overflow-y-auto rounded-none border-k-line">
          <DialogHeader>
            <DialogTitle>Απάντηση DeepSeek</DialogTitle>
            <DialogDescription>Η τελευταία απόπειρα ανάλυσης αυτού του προϊόντος, όπως καταγράφηκε.</DialogDescription>
          </DialogHeader>
          {error ? (
            <LoadError title="Η καταγραφή δεν φόρτωσε." message={error} onRetry={() => void load()} />
          ) : !data ? (
            <Loader2 className="size-5 animate-spin text-k-text-4" aria-label="Φόρτωση" />
          ) : !trace ? (
            <div className="space-y-1 text-[length:var(--fs-12-5)]">
              <p>Δεν υπάρχει καταγραφή ανάλυσης ακόμα.</p>
              {data.analysisError && <p className="text-k-text-3">Τελευταίο σφάλμα: {data.analysisError}</p>}
            </div>
          ) : (
            <TraceView trace={trace} data={data} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h4 className="text-[length:var(--fs-11)] font-semibold uppercase tracking-[0.06em] text-k-text-4">{title}</h4>
      {children}
    </section>
  );
}

function TraceView({ trace, data }: { trace: Trace; data: AnalysisRawView }) {
  const selected = new Set([...(trace.selected?.features ?? []), ...(trace.selected?.specs ?? [])]);
  const excluded = new Set(trace.selected?.exclude ?? []);
  const mark = (id: string) =>
    excluded.has(id) ? <Tag tone="danger">εξαίρεση</Tag> : selected.has(id) ? <Tag tone="ok">επιλέχθηκε</Tag> : null;
  return (
    <div className="min-w-0 space-y-4 text-[length:var(--fs-12)]">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="outline">{trace.path === "official" ? "Επίσημη διαδρομή" : "Διαδρομή XML"}</Tag>
        <span>{when(trace.at)}</span>
        {trace.model && <span className="text-k-text-3">μοντέλο {trace.model}</span>}
        {trace.usage && (
          <span className="numeral text-k-text-3">
            tokens {trace.usage.promptTokens ?? "—"} + {trace.usage.completionTokens ?? "—"} = {trace.usage.totalTokens ?? "—"}
          </span>
        )}
        {trace.truncated && <Tag tone="wait">κομμένη καταγραφή</Tag>}
      </div>

      {(trace.error || data.analysisError) && (
        <Notice tone="warn">
          {trace.error ?? data.analysisError}
          {trace.responseError ? ` · ${trace.responseError}` : ""}
        </Notice>
      )}

      {trace.officialLabels && trace.officialLabels.length > 0 && (
        <Block title="Επίσημες ετικέτες που είδε το μοντέλο">
          <p className="break-words">{trace.officialLabels.join(" · ")}</p>
        </Block>
      )}

      <Block title="Κομμάτια που στάλθηκαν">
        {(trace.inventory?.segments.length ?? 0) + (trace.inventory?.specs.length ?? 0) === 0 ? (
          <p className="text-k-text-3">—</p>
        ) : (
          <ul className="space-y-1">
            {trace.inventory?.segments.map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <span className="w-10 shrink-0 font-mono text-k-text-4">{s.id}</span>
                <span className="min-w-0 flex-1 break-words">{s.text}</span>
                {mark(s.id)}
              </li>
            ))}
            {trace.inventory?.specs.map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <span className="w-10 shrink-0 font-mono text-k-text-4">{s.id}</span>
                <span className="min-w-0 flex-1 break-words">
                  {s.label}: {s.value}
                </span>
                {mark(s.id)}
              </li>
            ))}
          </ul>
        )}
      </Block>

      {trace.names && (
        <Block title="Ονόματα en/it">
          <p className="break-words">
            EN: {trace.names.en ?? "—"} → {trace.names.acceptedEn ? "δεκτό" : "απορρίφθηκε"}
          </p>
          <p className="break-words">
            IT: {trace.names.it ?? "—"} → {trace.names.acceptedIt ? "δεκτό" : "απορρίφθηκε"}
          </p>
        </Block>
      )}

      <Block title={`Απορρίφθηκαν (${trace.dropped?.length ?? 0})`}>
        {trace.dropped && trace.dropped.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5">
            {trace.dropped.map((d, i) => (
              <li key={i} className="break-words">
                {d}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-k-text-3">Τίποτα.</p>
        )}
      </Block>

      <Block title="Ωμή απάντηση του μοντέλου">
        {trace.response == null ? (
          <p className="text-k-text-3">Καμία απάντηση.</p>
        ) : (
          <pre className="max-h-96 overflow-y-auto border border-k-line bg-k-surface-3 p-2 font-mono break-words whitespace-pre-wrap">
            {typeof trace.response === "string" ? trace.response : JSON.stringify(trace.response, null, 2)}
          </pre>
        )}
      </Block>
    </div>
  );
}
