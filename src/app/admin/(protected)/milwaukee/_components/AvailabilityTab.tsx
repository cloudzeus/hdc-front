"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AVAILABILITY_LABEL,
  type AvailabilityCounts,
  type AvailabilityRow,
  type AvailabilityState,
} from "@/lib/hdctool/milwaukee-admin-contract";
import { cn } from "@/lib/utils";
import { money, num } from "./format";
import { TablePager, Tag, pageSlice, type Tone } from "./kit";

const STATE_TONE: Record<AvailabilityState, Tone> = { stock: "ok", supplier: "info", order: "neutral" };

/**
 * «Διαθεσιμότητα» (μόνο ανάγνωση): τα Milwaukee του SoftOne με την κατάσταση
 * που δείχνει το eshop — δικό μας απόθεμα, μετά ο προμηθευτής, μετά παραγγελία.
 */
export function AvailabilityTab({ counts, rows }: { counts: AvailabilityCounts; rows: AvailabilityRow[] }) {
  const [state, setState] = useState<AvailabilityState | "all">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (state === "all" || r.state === state) &&
        (!q || r.code2.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || String(r.mtrl).includes(q)),
    );
  }, [rows, state, query]);
  const pageRows = pageSlice(filtered, page);

  const tiles: Array<{ key: AvailabilityState | null; label: string; value: number; hint: string }> = [
    { key: "stock", label: "Σε απόθεμα", value: counts.stock, hint: "δικό μας πωλήσιμο απόθεμα" },
    { key: "supplier", label: "3–5 εργάσιμες", value: counts.supplier, hint: "«Διαθέσιμο» στον προμηθευτή" },
    { key: "order", label: "1–3 εργάσιμες", value: counts.order, hint: "ούτε εμείς ούτε ο προμηθευτής" },
    { key: null, label: "Μόνο XML, εκτός ERP", value: counts.xmlOnly, hint: "διαθέσιμα χωρίς είδος στο SoftOne" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-px border border-k-line bg-k-line lg:grid-cols-4">
        {tiles.map((t) => {
          const active = t.key != null && state === t.key;
          const body = (
            <>
              <span className="block text-[length:var(--fs-10)] font-medium uppercase tracking-[0.08em] text-k-text-4">
                {t.label}
              </span>
              <span className="numeral mt-1 block text-[length:var(--fs-21)] font-semibold leading-none text-k-ink">
                {num(t.value)}
              </span>
              <span className="mt-1 block text-[length:var(--fs-11)] text-k-text-4">{t.hint}</span>
            </>
          );
          return t.key ? (
            <button
              key={t.label}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setState(active ? "all" : t.key!);
                setPage(1);
              }}
              className={cn(
                "bg-white px-4 py-3.5 text-left transition-colors hover:bg-k-surface-3",
                active && "bg-k-gold-tint shadow-[inset_0_-2px_0_var(--color-k-ink)]",
              )}
            >
              {body}
            </button>
          ) : (
            <div key={t.label} className="bg-white px-4 py-3.5">
              {body}
            </div>
          );
        })}
      </div>

      <div className="grid gap-2 border border-k-line bg-white p-3 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-k-text-4" aria-hidden />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Αναζήτηση σε κωδικό ή όνομα…"
            aria-label="Αναζήτηση"
            className="pl-9"
          />
        </div>
        <Select
          value={state}
          onValueChange={(v) => {
            setState(v as AvailabilityState | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full" aria-label="Κατάσταση">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Όλες οι καταστάσεις</SelectItem>
            <SelectItem value="stock">{AVAILABILITY_LABEL.stock}</SelectItem>
            <SelectItem value="supplier">{AVAILABILITY_LABEL.supplier}</SelectItem>
            <SelectItem value="order">{AVAILABILITY_LABEL.order}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <section className="border border-k-line bg-white" aria-label="Milwaukee του SoftOne">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-[length:var(--fs-12-5)] text-k-text-3">
            Κανένα προϊόν δεν ταιριάζει στα φίλτρα.
          </p>
        ) : (
          <>
            {/* ≥1024px: πίνακας σταθερής διάταξης, χωρίς οριζόντια κύλιση. */}
            <table className="hidden w-full table-fixed text-left lg:table">
              <thead>
                <tr className="border-b border-k-line text-[length:var(--fs-10)] uppercase tracking-[0.06em] text-k-text-4">
                  <th className="w-36 px-4 py-2.5 font-medium">Κωδικός</th>
                  <th className="px-3 py-2.5 font-medium">Όνομα</th>
                  <th className="w-24 px-3 py-2.5 text-right font-medium">Απόθεμα</th>
                  <th className="w-64 px-3 py-2.5 font-medium">Κατάσταση</th>
                  <th className="w-28 px-4 py-2.5 text-right font-medium">Τιμή eshop</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.mtrl} className="border-b border-k-line last:border-0">
                    <td className="break-all px-4 py-2 font-mono text-[length:var(--fs-12)] text-k-text-2">
                      {r.code2 || r.mtrl}
                    </td>
                    <td className="px-3 py-2">
                      <p className="line-clamp-2 break-words text-[length:var(--fs-12-5)] text-k-ink" title={r.name}>
                        {r.name}
                      </p>
                    </td>
                    <td className="numeral px-3 py-2 text-right text-[length:var(--fs-12-5)]">{num(r.sellable)}</td>
                    <td className="px-3 py-2">
                      <StateCell row={r} />
                    </td>
                    <td className="numeral px-4 py-2 text-right text-[length:var(--fs-12-5)]">{money(r.priceWeb)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* <1024px: κάρτες αντί για οριζόντια κύλιση. */}
            <ul className="divide-y divide-k-line lg:hidden">
              {pageRows.map((r) => (
                <li key={r.mtrl} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 min-w-0 break-words text-[length:var(--fs-12-5)] font-medium text-k-ink">
                      {r.name}
                    </p>
                    <span className="numeral shrink-0 text-[length:var(--fs-12-5)]">{money(r.priceWeb)}</span>
                  </div>
                  <p className="font-mono text-[length:var(--fs-12)] text-k-text-3">
                    {r.code2 || r.mtrl} · απόθεμα <span className="numeral">{num(r.sellable)}</span>
                  </p>
                  <StateCell row={r} />
                </li>
              ))}
            </ul>
          </>
        )}
        <TablePager page={page} total={filtered.length} onPage={setPage} />
      </section>
    </div>
  );
}

function StateCell({ row }: { row: AvailabilityRow }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Tag tone={STATE_TONE[row.state]}>{AVAILABILITY_LABEL[row.state]}</Tag>
      <span className="text-[length:var(--fs-11)] text-k-text-3">
        XML: {row.supplierAvailable ? "Διαθέσιμο" : "—"} · eshop: {row.eshopListed ? "Ναι" : "Όχι"}
      </span>
    </div>
  );
}
