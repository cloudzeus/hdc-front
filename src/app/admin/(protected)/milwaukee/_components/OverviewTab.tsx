"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, Stat } from "@/components/admin/PageShell";
import type { MilwaukeeJobRunView, MilwaukeeOverview } from "@/lib/hdctool/milwaukee-admin-contract";
import { milwaukeeStartOfficialSync } from "../actions";
import { attempt, num, when } from "./format";
import { Notice, ProgressBar, Tag } from "./kit";

const REFRESH_MS = 30_000;

/**
 * Επισκόπηση: πόσα προϊόντα μόνο-XML είναι σε κάθε στάδιο, πόσο προχώρησαν η
 * ανάλυση και το ευρετήριο του επίσημου site, και τι τρέχει τώρα. Όσο κάτι
 * τρέχει, η σελίδα ξαναζητά τα νούμερα κάθε 30″.
 */
export function OverviewTab({ overview, canEdit }: { overview: MilwaukeeOverview; canEdit: boolean }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [starting, setStarting] = useState(false);
  const o = overview;
  const running = [
    o.official.running && "σάρωση του επίσημου site",
    o.analysis.running && "ανάλυση περιεχομένου",
    o.xmlSync.running && "συγχρονισμός του XML",
  ].filter((x): x is string => !!x);

  useEffect(() => {
    if (running.length === 0) return;
    const timer = setInterval(() => startRefresh(() => router.refresh()), REFRESH_MS);
    return () => clearInterval(timer);
  }, [running.length, router]);

  const startCrawl = async () => {
    setStarting(true);
    const r = await attempt(() => milwaukeeStartOfficialSync());
    setStarting(false);
    if (r.ok) {
      toast.success("Η ενημέρωση του ευρετηρίου ξεκίνησε στο παρασκήνιο.");
      startRefresh(() => router.refresh());
    } else if (r.status === 409) {
      toast.info("Τρέχει ήδη η ενημέρωση ή μια αναζήτηση.");
    } else {
      toast.error(r.error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-k-line bg-white px-4 py-3">
        <p className="flex min-w-0 items-center gap-2 text-[length:var(--fs-12-5)] text-k-text-2">
          {running.length > 0 ? (
            <>
              <Loader2 className="size-4 shrink-0 animate-spin text-k-amber" aria-hidden />
              <span>
                <b className="font-semibold text-k-ink">Τρέχει τώρα:</b> {running.join(", ")} · ανανέωση κάθε 30″
              </span>
            </>
          ) : (
            <span>Τίποτα δεν τρέχει αυτή τη στιγμή.</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <span className="numeral text-[length:var(--fs-11)] text-k-text-4">{when(o.generatedAt)}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={refreshing}
            onClick={() => startRefresh(() => router.refresh())}
          >
            <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} aria-hidden />
            Ανανέωση
          </Button>
        </div>
      </div>

      <section aria-label="Προϊόντα μόνο-XML">
        <div className="grid grid-cols-2 gap-px border border-k-line bg-k-line lg:grid-cols-4">
          <Stat label="Μόνο στο XML" value={num(o.items.total)} hint={`${num(o.items.archived)} αποσυρμένα`} />
          <Stat label="Πρόχειρα" value={num(o.items.draft)} hint="θέλουν όνομα, κατηγορία, τιμή" />
          <Stat label="Ενεργά" value={num(o.items.active)} />
          <Stat label="Στο eshop" value={num(o.items.inEshop)} hint="δημοσιεύσιμα από το XML" />
          <Stat label="Στο SoftOne" value={num(o.items.inSoftOne)} hint="με MTRL" />
          <Stat label="Με αποκλίσεις" value={num(o.items.withDiscrepancies)} hint="XML ≠ επίσημα" />
          <Stat label="Χωρίς κατηγορία" value={num(o.items.withoutCategory)} hint="εκτός των αποσυρμένων" />
          <Stat label="Ετικέτες προς έγκριση" value={num(o.labels.pending)} hint={`${num(o.labels.approved)} εγκεκριμένες`} />
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-12)]">
          <TabLink tab="xml">Προϊόντα μόνο-XML</TabLink>
          <TabLink tab="labels">Ετικέτες τεχνικών</TabLink>
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Ανάλυση περιεχομένου" description="Χαρακτηριστικά και τεχνικά από το XML ή τα επίσημα, με AI.">
          <div className="space-y-3">
            <ProgressBar label="Αναλύθηκαν" value={o.analysis.done} of={o.items.total} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[length:var(--fs-12-5)]">
              <Row label="Σε αναμονή" value={num(o.analysis.pending)} />
              <Row label="Σταμάτησαν (3 αποτυχίες)" value={num(o.analysis.failed)} />
              <Row label="Τελευταία ανάλυση" value={when(o.analysis.lastAt)} />
              <Row label="Κατάσταση" value={o.analysis.running ? <Tag tone="wait">τρέχει</Tag> : "—"} />
            </dl>
            <RunView title="Τελευταία παρτίδα" run={o.analysis.lastRun} />
          </div>
        </Panel>

        <Panel
          title="Ευρετήριο επίσημου site"
          description="Σελίδες του milwaukeetool.eu και κωδικοί που βρέθηκαν σε αυτές."
          actions={
            canEdit ? (
              <Button type="button" size="sm" variant="outline" disabled={starting || o.official.running} onClick={startCrawl}>
                {starting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
                Ενημέρωση ευρετηρίου
              </Button>
            ) : undefined
          }
        >
          <div className="space-y-3">
            <ProgressBar label="Σελίδες που διαβάστηκαν" value={o.official.pagesFetched} of={o.official.pagesTotal} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[length:var(--fs-12-5)]">
              <Row label="Κωδικοί στο ευρετήριο" value={num(o.official.productsIndexed)} />
              <Row label="Χωρίς ιταλικά τεχνικά" value={num(o.official.italianMissing)} />
              <Row label="Τελευταία σάρωση" value={when(o.official.lastRunAt)} />
              <Row label="Κατάσταση" value={o.official.running ? <Tag tone="wait">τρέχει</Tag> : "—"} />
            </dl>
            {o.official.lastStoppedBy && (
              <Notice tone="warn">Η τελευταία σάρωση σταμάτησε: {o.official.lastStoppedBy}</Notice>
            )}
            <RunView title="Τελευταία σάρωση" run={o.official.lastRun} />
            <TabLink tab="official">Αναζήτηση κωδικού στο επίσημο site</TabLink>
          </div>
        </Panel>

        <Panel title="Συγχρονισμός XML" description="Το XML του Παπαθεοδοσίου → προϊόντα μόνο-XML.">
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[length:var(--fs-12-5)]">
              <Row label="Τελευταίος" value={when(o.xmlSync.lastAt)} />
              <Row label="Κατάσταση" value={o.xmlSync.running ? <Tag tone="wait">τρέχει</Tag> : "—"} />
            </dl>
            {o.xmlSync.error && <Notice tone="danger">{o.xmlSync.error}</Notice>}
            <StatsList stats={o.xmlSync.stats} />
          </div>
        </Panel>

        <Panel title="Ετικέτες τεχνικών" description="Στο eshop πηγαίνει μόνο η ελληνική ετικέτα που εγκρίθηκε.">
          <ProgressBar
            label="Εγκεκριμένες"
            value={o.labels.approved}
            of={o.labels.approved + o.labels.pending}
          />
        </Panel>
      </div>
    </div>
  );
}

function TabLink({ tab, children }: { tab: string; children: React.ReactNode }) {
  return (
    <Link
      href={`/admin/milwaukee?tab=${tab}`}
      className="inline-flex items-center gap-1 text-[length:var(--fs-12)] text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline"
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-k-text-3">{label}</dt>
      <dd className="numeral text-right text-k-ink">{value}</dd>
    </>
  );
}

/** Οι μετρητές μιας εκτέλεσης (`stats`): μόνο απλές τιμές, με τα κλειδιά όπως ήρθαν. */
function StatsList({ stats }: { stats: unknown }) {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return null;
  const entries = Object.entries(stats as Record<string, unknown>).filter(
    ([, v]) => typeof v === "number" || typeof v === "string" || typeof v === "boolean",
  );
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-k-line pt-2 text-[length:var(--fs-12)]">
      {entries.slice(0, 12).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate font-mono text-k-text-4" title={k}>
            {k}
          </dt>
          <dd className="numeral truncate text-right text-k-text-2" title={String(v)}>
            {typeof v === "number" ? num(v) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RunView({ title, run }: { title: string; run: MilwaukeeJobRunView | null }) {
  if (!run) return null;
  return (
    <div className="space-y-1.5 border-t border-k-line pt-2">
      <p className="text-[length:var(--fs-12)] text-k-text-3">
        {title}: {when(run.startedAt)} → {run.finishedAt ? when(run.finishedAt) : "σε εξέλιξη"}
      </p>
      {run.error && <Notice tone="danger">{run.error}</Notice>}
      <StatsList stats={run.stats} />
    </div>
  );
}
