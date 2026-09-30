"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpToLine, EyeOff, FilePen, Loader2, RefreshCw, RotateCcw, Save, Send } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AutoOverview, RunRow, RunState, TopicRow } from "@/lib/content-auto/admin";
import { GATE_LABELS, type GateId } from "@/lib/content-auto/gates";
import { cn } from "@/lib/utils";
import { autoRunStateAction, refreshQueueAction, saveAutoSettingsAction, startAutoRunAction, topicAction } from "../auto-actions";
import { Field, inputClass } from "./shared";

/**
 * «Αυτόματα άρθρα»: the settings, where the cadence stands, «Γράψε ένα τώρα»
 * (polled until the run ends), the topic queue and the run history. Tables
 * on wide screens, cards below 1024px — never a sideways scroll.
 */

const KIND: Record<string, string> = {
  MODEL: "Μοντέλο",
  CATEGORY: "Κατηγορία",
  NEW_PRODUCT: "Νέο προϊόν",
  KEYWORD: "Λέξη-κλειδί",
  QUERY: "Αναζήτηση",
};

const TRIGGER: Record<string, string> = { cron: "Αυτόματη", "manual-draft": "Ως πρόχειρο", "manual-publish": "Με δημοσίευση" };

const gate = (id: string) => GATE_LABELS[id as GateId] ?? id;
const when = (iso: string) =>
  new Date(iso).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" });

function OutcomeTag({ outcome }: { outcome: string | null }) {
  const [label, tone] =
    outcome === "PUBLISHED"
      ? ["Δημοσιεύτηκε", "ok"]
      : outcome === "DRAFT"
        ? ["Πρόχειρο", "wait"]
        : outcome === "FAILED"
          ? ["Απέτυχε", "red"]
          : outcome === "SKIPPED"
            ? ["Παραλείφθηκε", "muted"]
            : ["Τρέχει…", "muted"];
  return (
    <span
      className={cn(
        "inline-flex border border-transparent px-1.5 py-px text-[length:var(--fs-11)] font-medium whitespace-nowrap",
        tone === "ok" && "bg-[var(--hdc-ok)]/10 text-[var(--hdc-ok)]",
        tone === "wait" && "bg-[var(--hdc-wait)]/10 text-[var(--hdc-wait)]",
        tone === "red" && "bg-k-red/10 text-k-red",
        tone === "muted" && "bg-k-surface-3 text-k-text-3",
      )}
    >
      {label}
    </span>
  );
}

function TopicState({ t }: { t: TopicRow }) {
  return (
    <span className="text-[length:var(--fs-12)] text-k-text-3">
      {t.pinned && <span className="mr-1 font-semibold text-k-red">Πρώτο ·</span>}
      {t.status === "FAILED" ? `${t.attempts}/3 αποτυχίες` : t.status === "SKIPPED" ? "Παραλείφθηκε" : "Περιμένει"}
    </span>
  );
}

export function AutoPanel({ data, canEdit }: { data: AutoOverview; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(data.settings.enabled);
  const [email, setEmail] = useState(data.settings.notifyEmail);
  const [maxPerWeek, setMaxPerWeek] = useState(data.settings.maxPerWeek);
  const [runId, setRunId] = useState<string | null>(data.running);
  const [run, setRun] = useState<RunState | null>(null);

  const dirty = enabled !== data.settings.enabled || email !== data.settings.notifyEmail || maxPerWeek !== data.settings.maxPerWeek;

  // Follow a run until it ends: every 4″, from the database, whichever server answers.
  useEffect(() => {
    if (!runId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const state = await autoRunStateAction(runId).catch(() => null);
      if (!alive) return;
      setRun(state);
      if (!state || state.finished) {
        setRunId(null);
        if (state) {
          if (state.outcome === "FAILED") toast.error(`Η εκτέλεση απέτυχε: ${state.error ?? ""}`);
          else toast.success(state.outcome === "PUBLISHED" ? "Δημοσιεύτηκε." : "Αποθηκεύτηκε ως πρόχειρο.");
        }
        router.refresh();
        return;
      }
      timer = setTimeout(poll, 4000);
    };
    timer = setTimeout(poll, 1500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [runId, router]);

  const save = () =>
    start(async () => {
      const r = await saveAutoSettingsAction({ enabled, notifyEmail: email.trim(), maxPerWeek });
      if (!r.ok) return void toast.error(r.error);
      toast.success(enabled ? "Αποθηκεύτηκε· τα αυτόματα άρθρα είναι ενεργά." : "Αποθηκεύτηκε.");
      router.refresh();
    });

  const write = (mode: "draft" | "publish") =>
    start(async () => {
      const r = await startAutoRunAction(mode);
      if (!r.ok) return void toast.error(r.error);
      setRun(null);
      setRunId(r.runId);
      toast.message("Ξεκίνησε· διαρκεί μερικά λεπτά.");
    });

  const refresh = () =>
    start(async () => {
      const r = await refreshQueueAction();
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Ουρά: ${r.planned} θέματα (${r.created} νέα, ${r.removed} αφαιρέθηκαν).`);
      router.refresh();
    });

  const onTopic = (t: TopicRow, action: "skip" | "first" | "restore") =>
    start(async () => {
      const r = await topicAction(t.id, action);
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });

  const busy = pending || runId != null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Settings */}
        <section className="grid content-start gap-3 border border-k-line bg-white p-4">
          <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Ρυθμίσεις</h2>
          <label className="flex min-h-11 items-center justify-between gap-3 border border-k-line px-3">
            <span className="text-[length:var(--fs-13)] text-k-ink">
              Αυτόματη γραφή και δημοσίευση
              <span className="block text-[length:var(--fs-11)] text-k-text-3">Εργάσιμες 09:00–19:00, μόνο ό,τι περνά όλους τους ελέγχους.</span>
            </span>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit || pending} aria-label="Αυτόματα άρθρα ενεργά" />
          </label>
          <Field id="auto-email" label="Email ειδοποίησης" hint="Το link κάθε νέου άρθρου, ή οι έλεγχοι που απέτυχαν. Κενό = καμία ειδοποίηση.">
            <Input
              id="auto-email"
              type="email"
              inputMode="email"
              value={email}
              placeholder="info@…"
              disabled={!canEdit || pending}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="auto-max" label="Ανώτατο την εβδομάδα" hint="Η συχνότητα προσαρμόζεται στην ουρά (3, 2 ή 1 την εβδομάδα), ποτέ πάνω από αυτό· το πολύ ένα τη μέρα.">
            <select
              id="auto-max"
              value={maxPerWeek}
              disabled={!canEdit || pending}
              onChange={(e) => setMaxPerWeek(Number(e.target.value))}
              className="h-11 w-full border border-k-line bg-white px-2 text-[length:var(--fs-13)] text-k-ink sm:w-40"
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          {canEdit && (
            <Button type="button" className="w-fit" disabled={pending || !dirty} onClick={save}>
              <Save aria-hidden />
              Αποθήκευση
            </Button>
          )}
        </section>

        {/* Status and «write one now» */}
        <section className="grid content-start gap-3 border border-k-line bg-white p-4">
          <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Συχνότητα</h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[length:var(--fs-12)]">
            <dt className="text-k-text-3">Κατάσταση</dt>
            <dd className={cn("font-medium", data.settings.enabled ? "text-[var(--hdc-ok)]" : "text-k-text-2")}>
              {data.settings.enabled ? "Ενεργό" : "Ανενεργό"}
            </dd>
            <dt className="text-k-text-3">Θέματα στην ουρά</dt>
            <dd className="numeral text-k-ink">
              {data.status.backlog} <span className="text-k-text-4">(βαθμολογία ≥ {data.status.threshold})</span>
            </dd>
            <dt className="text-k-text-3">Στόχος</dt>
            <dd className="numeral text-k-ink">{data.status.target} την εβδομάδα</dd>
            <dt className="text-k-text-3">Τις τελευταίες 7 μέρες</dt>
            <dd className="numeral text-k-ink">{data.status.publishedThisWeek} δημοσιεύσεις</dd>
            <dt className="text-k-text-3">Επόμενο</dt>
            <dd className="text-k-ink">{data.status.next}</dd>
          </dl>

          <h3 className="mt-2 text-[length:var(--fs-12)] font-semibold text-k-ink">Γράψε ένα τώρα</h3>
          <p className="text-[length:var(--fs-11)] leading-[1.5] text-k-text-3">
            Παίρνει το πρώτο θέμα της ουράς, ανεξάρτητα από τη συχνότητα. Κοστίζει tokens DeepSeek και ανεβάζει τη φωτογραφία στο CDN.
          </p>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={busy || data.topics.length === 0} onClick={() => write("draft")}>
                <FilePen aria-hidden />
                Ως πρόχειρο
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" className="h-auto min-h-11 whitespace-normal" disabled={busy || data.topics.length === 0}>
                    <Send aria-hidden />
                    Με δημοσίευση αν περάσει
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Γραφή με δημοσίευση;</AlertDialogTitle>
                    <AlertDialogDescription>
                      Αν το κείμενο περάσει όλους τους ελέγχους, θα δημοσιευτεί αμέσως στο κατάστημα, στο sitemap και στο llms.txt. Αλλιώς
                      μένει πρόχειρο. Αποσύρεται οποτεδήποτε από τη λίστα των άρθρων.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Άκυρο</AlertDialogCancel>
                    <AlertDialogAction onClick={() => write("publish")}>Γράψε</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          {runId && (
            <p className="flex items-center gap-2 text-[length:var(--fs-12)] text-k-text-2" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Γράφεται{run ? ` · ${run.seconds}″` : "…"} Μπορείτε να κλείσετε τη σελίδα· η εκτέλεση συνεχίζει.
            </p>
          )}
          {!runId && run && <RunResult run={run} />}
        </section>
      </div>

      {/* The queue */}
      <section className="grid gap-3 border border-k-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">
            Ουρά θεμάτων{" "}
            <span className="numeral font-normal text-k-text-3">
              ({data.topicCount}
              {data.topicCount > data.topics.length ? `, τα πρώτα ${data.topics.length}` : ""})
            </span>
          </h2>
          {canEdit && (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={refresh}>
              <RefreshCw aria-hidden />
              Ανανέωση ουράς
            </Button>
          )}
        </div>
        <p className="text-[length:var(--fs-11)] leading-[1.5] text-k-text-3">
          Ανανεώνεται μία φορά την ημέρα από τον κατάλογο: μοντέλα χωρίς άρθρο, κατηγορίες χωρίς οδηγό, νέα προϊόντα, το keyword map.
          Βαθμολογία = ζήτηση × κενό.
        </p>
        {data.topics.length === 0 ? (
          <p className="border border-dashed border-k-line p-4 text-[length:var(--fs-12)] text-k-text-3">
            Η ουρά είναι άδεια. {canEdit ? "Πατήστε «Ανανέωση ουράς»." : ""}
          </p>
        ) : (
          <>
            <table className="hidden w-full text-[length:var(--fs-13)] lg:table">
              <thead className="bg-k-surface-3 text-left text-[length:var(--fs-11)] uppercase tracking-[0.06em] text-k-text-3">
                <tr>
                  <th className="px-3 py-2 font-medium">Βαθμ.</th>
                  <th className="px-3 py-2 font-medium">Θέμα</th>
                  <th className="px-3 py-2 font-medium">Κατάσταση</th>
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">Ενέργειες</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.topics.map((t) => (
                  <tr key={t.id} className="border-t border-k-line align-top">
                    <td className="numeral px-3 py-2.5 font-semibold text-k-ink">{t.score}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-k-ink">{t.title}</p>
                      <p className="text-[length:var(--fs-12)] text-k-text-3">
                        {KIND[t.kind] ?? t.kind} · {t.reason}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <TopicState t={t} />
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {canEdit && <TopicButtons t={t} disabled={pending} onAction={onTopic} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="grid gap-2 lg:hidden">
              {data.topics.map((t) => (
                <li key={t.id} className="grid gap-1.5 border border-k-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-medium text-[length:var(--fs-13)] text-k-ink">{t.title}</p>
                    <span className="numeral shrink-0 text-[length:var(--fs-13)] font-semibold text-k-ink">{t.score}</span>
                  </div>
                  <p className="text-[length:var(--fs-12)] text-k-text-3">
                    {KIND[t.kind] ?? t.kind} · {t.reason}
                  </p>
                  <TopicState t={t} />
                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      <TopicButtons t={t} disabled={pending} onAction={onTopic} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {data.skipped.length > 0 && (
          <details className="border-t border-k-line pt-3">
            <summary className="cursor-pointer text-[length:var(--fs-12)] text-k-text-2">Παραλείφθηκαν ({data.skipped.length})</summary>
            <ul className="mt-2 grid gap-1.5">
              {data.skipped.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-[length:var(--fs-12)]">
                  <span className="min-w-0 text-k-text-2">
                    {t.title} <span className="text-k-text-4">· {t.attempts} αποτυχίες</span>
                  </span>
                  {canEdit && (
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onTopic(t, "restore")}>
                      <RotateCcw aria-hidden />
                      Επαναφορά
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* The history */}
      <section className="grid gap-3 border border-k-line bg-white p-4">
        <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Ιστορικό εκτελέσεων</h2>
        {data.runs.length === 0 ? (
          <p className="text-[length:var(--fs-12)] text-k-text-3">Καμία εκτέλεση ακόμα.</p>
        ) : (
          <>
            <table className="hidden w-full text-[length:var(--fs-13)] lg:table">
              <thead className="bg-k-surface-3 text-left text-[length:var(--fs-11)] uppercase tracking-[0.06em] text-k-text-3">
                <tr>
                  <th className="px-3 py-2 font-medium">Πότε</th>
                  <th className="px-3 py-2 font-medium">Θέμα · άρθρο</th>
                  <th className="px-3 py-2 font-medium">Αποτέλεσμα</th>
                  <th className="px-3 py-2 font-medium">Έλεγχοι που απέτυχαν</th>
                  <th className="px-3 py-2 text-right font-medium">Tokens</th>
                  <th className="px-3 py-2 text-right font-medium">Διάρκεια</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id} className="border-t border-k-line align-top">
                    <td className="px-3 py-2.5 text-[length:var(--fs-12)] whitespace-nowrap text-k-text-2">
                      {when(r.startedAt)}
                      <br />
                      <span className="text-k-text-4">{TRIGGER[r.trigger] ?? r.trigger}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <RunSubject r={r} />
                    </td>
                    <td className="px-3 py-2.5">
                      <OutcomeTag outcome={r.outcome} />
                    </td>
                    <td className="px-3 py-2.5 text-[length:var(--fs-12)] text-k-text-2">
                      {r.failedGates.length ? r.failedGates.map(gate).join(" · ") : r.error ? <span className="text-k-red">{r.error}</span> : "—"}
                    </td>
                    <td className="numeral px-3 py-2.5 text-right text-k-text-2">{r.tokens.toLocaleString("el-GR")}</td>
                    <td className="numeral px-3 py-2.5 text-right text-k-text-2">{r.seconds != null ? `${r.seconds}″` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="grid gap-2 lg:hidden">
              {data.runs.map((r) => (
                <li key={r.id} className="grid gap-1.5 border border-k-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[length:var(--fs-12)] text-k-text-3">
                      {when(r.startedAt)} · {TRIGGER[r.trigger] ?? r.trigger}
                    </span>
                    <OutcomeTag outcome={r.outcome} />
                  </div>
                  <RunSubject r={r} />
                  {(r.failedGates.length > 0 || r.error) && (
                    <p className="text-[length:var(--fs-12)] text-k-text-2">
                      {r.failedGates.length ? `Απέτυχαν: ${r.failedGates.map(gate).join(" · ")}` : <span className="text-k-red">{r.error}</span>}
                    </p>
                  )}
                  <p className="numeral text-[length:var(--fs-11)] text-k-text-4">
                    {r.tokens.toLocaleString("el-GR")} tokens{r.seconds != null ? ` · ${r.seconds}″` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function TopicButtons({ t, disabled, onAction }: { t: TopicRow; disabled: boolean; onAction: (t: TopicRow, a: "skip" | "first") => void }) {
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="min-h-11 lg:min-h-8" disabled={disabled || t.pinned} onClick={() => onAction(t, "first")}>
        <ArrowUpToLine aria-hidden />
        Πρώτο
      </Button>{" "}
      <Button type="button" size="sm" variant="outline" className="min-h-11 lg:min-h-8" disabled={disabled} onClick={() => onAction(t, "skip")}>
        <EyeOff aria-hidden />
        Αγνόησε
      </Button>
    </>
  );
}

function RunSubject({ r }: { r: RunRow }) {
  return (
    <div className="min-w-0">
      {r.article ? (
        <Link href={`/admin/seo?tab=articles&edit=${r.article.id}`} className="font-medium text-k-ink hover:text-k-red">
          {r.article.title}
        </Link>
      ) : (
        <p className="font-medium text-k-ink">{r.topic ?? "—"}</p>
      )}
      {r.article && r.topic && <p className="text-[length:var(--fs-12)] text-k-text-3">{r.topic}</p>}
      {r.article && <p className="font-mono text-[length:var(--fs-11)] break-all text-k-text-4">{r.article.slug}</p>}
    </div>
  );
}

function RunResult({ run }: { run: RunState }) {
  return (
    <div className="grid gap-1 border border-k-line bg-k-surface-2 p-3 text-[length:var(--fs-12)]">
      <div className="flex flex-wrap items-center gap-2">
        <OutcomeTag outcome={run.outcome} />
        <span className="numeral text-k-text-3">
          {run.tokens.toLocaleString("el-GR")} tokens · {run.seconds}″
        </span>
      </div>
      {run.article && (
        <Link href={`/admin/seo?tab=articles&edit=${run.article.id}`} className="font-medium text-k-ink hover:text-k-red">
          {run.article.title}
        </Link>
      )}
      {run.failedGates.length > 0 && <p className="text-k-text-2">Απέτυχαν: {run.failedGates.map(gate).join(" · ")}</p>}
      {run.error && <p className="text-k-red">{run.error}</p>}
    </div>
  );
}
