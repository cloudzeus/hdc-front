"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SpecLabelRow } from "@/lib/hdctool/milwaukee-admin-contract";
import { milwaukeeApproveLabels } from "../actions";
import { attempt, num, when } from "./format";
import { TablePager, Tag, pageSlice } from "./kit";

type Filter = "pending" | "approved" | "all";

/**
 * «Ετικέτες τεχνικών»: η ελληνική ετικέτα κάθε αγγλικής ετικέτας των
 * επίσημων τεχνικών Milwaukee. Στο eshop πηγαίνει ΜΟΝΟ ό,τι εγκρίνεται εδώ·
 * μέχρι τότε μένει η αγγλική. Η πρόταση είναι του μοντέλου, για διευκόλυνση.
 */
export function SpecLabelsTab({ labels, canEdit }: { labels: SpecLabelRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("pending");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  const draftOf = (r: SpecLabelRow) => drafts[r.en] ?? r.el ?? r.proposedEl ?? "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return labels.filter(
      (r) =>
        (filter === "all" || (filter === "approved" ? r.approved : !r.approved)) &&
        (!q || r.en.toLowerCase().includes(q) || (r.el ?? r.proposedEl ?? "").toLowerCase().includes(q)),
    );
  }, [labels, filter, query]);

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
    setSelected(new Set());
  };

  const approve = async (rows: SpecLabelRow[]) => {
    const payload = rows.map((r) => ({ en: r.en, el: draftOf(r).trim() }));
    if (payload.some((r) => !r.el)) {
      toast.error("Συμπληρώστε ελληνική ετικέτα πριν την έγκριση");
      return;
    }
    setPending(true);
    const r = await attempt(() => milwaukeeApproveLabels(payload));
    setPending(false);
    if (!r.ok) {
      toast.error(`Η έγκριση απέτυχε: ${r.error}`);
      return;
    }
    toast.success(`Εγκρίθηκαν ${num(r.approved)}· ενημερώθηκαν ${num(r.rerendered)} προϊόντα`);
    setSelected(new Set());
    startRefresh(() => router.refresh());
  };

  const pageRows = pageSlice(filtered, page);
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.en));
  const toggle = (en: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(en);
      else next.delete(en);
      return next;
    });
  const busy = pending || refreshing;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 border border-k-line bg-white p-3 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-k-text-4" aria-hidden />
          <Input
            value={query}
            onChange={(e) => reset(() => setQuery(e.target.value))}
            placeholder="Αναζήτηση σε αγγλική ή ελληνική ετικέτα…"
            aria-label="Αναζήτηση ετικέτας"
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => reset(() => setFilter(v as Filter))}>
          <SelectTrigger className="w-full" aria-label="Κατάσταση ετικέτας">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Προς έγκριση</SelectItem>
            <SelectItem value="approved">Εγκεκριμένες</SelectItem>
            <SelectItem value="all">Όλες</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {canEdit && selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 border border-k-line bg-white px-4 py-2"
          role="region"
          aria-label="Μαζική έγκριση"
        >
          <span className="numeral text-[length:var(--fs-13)] font-semibold text-k-ink">
            {num(selected.size)} επιλεγμένες
          </span>
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            disabled={busy}
            onClick={() => void approve(labels.filter((r) => selected.has(r.en)))}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
            Έγκριση επιλεγμένων
          </Button>
        </div>
      )}

      <section className="border border-k-line bg-white" aria-label="Ετικέτες τεχνικών">
        {canEdit && pageRows.length > 0 && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2 border-b border-k-line px-4 text-[length:var(--fs-12)] text-k-text-3">
            <Checkbox checked={allOnPage} onCheckedChange={(v) => pageRows.forEach((r) => toggle(r.en, v === true))} />
            Επιλογή όλων της σελίδας
          </label>
        )}
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-[length:var(--fs-12-5)] text-k-text-3">
            Καμία ετικέτα δεν ταιριάζει στα φίλτρα.
          </p>
        ) : (
          <ul className="divide-y divide-k-line">
            {pageRows.map((r) => (
              <li
                key={r.en}
                className="grid gap-x-4 gap-y-2 px-4 py-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center"
              >
                {canEdit ? (
                  <Checkbox
                    checked={selected.has(r.en)}
                    onCheckedChange={(v) => toggle(r.en, v === true)}
                    aria-label={`Επιλογή ${r.en}`}
                    className="hidden lg:flex"
                  />
                ) : (
                  <span className="hidden lg:block" />
                )}
                <div className="min-w-0">
                  <p className="break-words text-[length:var(--fs-12-5)] font-medium text-k-ink">{r.en}</p>
                  <p className="text-[length:var(--fs-11)] text-k-text-4">
                    <span className="numeral">{num(r.uses)}</span> χρήσεις
                    {r.proposedEl ? ` · πρόταση: ${r.proposedEl}` : ""}
                  </p>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  {canEdit && (
                    <Checkbox
                      checked={selected.has(r.en)}
                      onCheckedChange={(v) => toggle(r.en, v === true)}
                      aria-label={`Επιλογή ${r.en}`}
                      className="lg:hidden"
                    />
                  )}
                  <Input
                    aria-label={`Ελληνική ετικέτα για ${r.en}`}
                    value={draftOf(r)}
                    maxLength={191}
                    disabled={!canEdit}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.en]: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {r.approved ? (
                    <Tag tone="ok" className="max-w-full">
                      Εγκεκριμένη{r.approvedAt ? ` · ${when(r.approvedAt)}` : ""}
                    </Tag>
                  ) : (
                    <Tag>Προς έγκριση</Tag>
                  )}
                  {canEdit && (
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void approve([r])}>
                      <Check className="size-3.5" aria-hidden />
                      Έγκριση
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <TablePager page={page} total={filtered.length} onPage={setPage} />
      </section>
    </div>
  );
}
