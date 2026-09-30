"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OfficialSearchResult, OfficialSpecView, OfficialView } from "@/lib/hdctool/milwaukee-admin-contract";
import { milwaukeeStartOfficialSync } from "../actions";
import { attempt, num, when } from "./format";
import { Tag } from "./kit";

/** Η γραμμή του ευρετηρίου για έναν κωδικό: σελίδα, μοντέλο, EAN, τεχνικά en/it. */
export function OfficialProduct({ product }: { product: NonNullable<OfficialView["product"]> }) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[length:var(--fs-12-5)]">
        <dt className="text-k-text-3">Σελίδα</dt>
        <dd className="min-w-0 break-all">
          <a
            href={product.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-k-ink underline underline-offset-2 hover:text-k-red"
          >
            {product.url}
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        </dd>
        <dt className="text-k-text-3">Μοντέλο</dt>
        <dd>{product.model ?? "—"}</dd>
        <dt className="text-k-text-3">EAN</dt>
        <dd className="font-mono">{product.ean ?? "—"}</dd>
        <dt className="text-k-text-3">Οικογένεια</dt>
        <dd>{product.groupName ?? "—"}</dd>
        <dt className="text-k-text-3">Ενημέρωση</dt>
        <dd>
          {when(product.fetchedAt)}
          {product.itCheckedAt ? ` · ιταλικά ${when(product.itCheckedAt)}` : ""}
        </dd>
      </dl>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SpecTable title="Τεχνικά (English)" specs={product.specsEn} />
        <SpecTable title="Τεχνικά (Italiano)" specs={product.specsIt} />
      </div>
    </div>
  );
}

function SpecTable({ title, specs }: { title: string; specs: OfficialSpecView[] | null }) {
  return (
    <section className="min-w-0 space-y-1">
      <h4 className="text-[length:var(--fs-12)] font-semibold text-k-ink">{title}</h4>
      {!specs || specs.length === 0 ? (
        <p className="text-[length:var(--fs-12)] text-k-text-3">{specs == null ? "Δεν έχουν ληφθεί ακόμα." : "—"}</p>
      ) : (
        <dl className="divide-y divide-k-line border-y border-k-line text-[length:var(--fs-12)]">
          {specs.map((s, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 py-1">
              <dt className="break-words text-k-text-3">{s.name}</dt>
              <dd className="break-words text-k-ink">
                {s.value}
                {s.unit ? ` ${s.unit}` : ""}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** Κατάσταση του ευρετηρίου και «Ενημέρωση ευρετηρίου» (με δικαίωμα αλλαγών). */
export function OfficialIndex({ index, canEdit }: { index: OfficialView["index"]; canEdit: boolean }) {
  const [starting, setStarting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const start = async () => {
    setStarting(true);
    const r = await attempt(() => milwaukeeStartOfficialSync());
    setStarting(false);
    const text = r.ok
      ? "Η ενημέρωση ξεκίνησε στο παρασκήνιο."
      : r.status === 409
        ? "Τρέχει ήδη η ενημέρωση ή μια αναζήτηση."
        : `Η ενημέρωση δεν ξεκίνησε: ${r.error}`;
    setNote(text);
    if (r.ok) toast.success(text);
    else if (r.status === 409) toast.info(text);
    else toast.error(text);
  };

  return (
    <section className="space-y-2 border border-k-line p-3">
      <h4 className="text-[length:var(--fs-12)] font-semibold text-k-ink">Ευρετήριο</h4>
      <p className="numeral text-[length:var(--fs-12)] text-k-text-2">
        Σελίδες {num(index.fetchedPages)} από {num(index.pages)} σαρωμένες · {num(index.products)} κωδικοί · τελευταία
        σάρωση {when(index.lastFetchedAt)}
        {index.crawling && " · σάρωση σε εξέλιξη"}
      </p>
      {canEdit && (
        <Button type="button" size="sm" variant="outline" disabled={starting || index.crawling} onClick={() => void start()}>
          {starting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
          Ενημέρωση ευρετηρίου
        </Button>
      )}
      {note && <p className="text-[length:var(--fs-12)] text-k-text-3">{note}</p>}
    </section>
  );
}

/** Το αποτέλεσμα της «Αναζήτησης στο επίσημο site». */
export function OfficialSearch({ search }: { search: OfficialSearchResult }) {
  return (
    <div className="space-y-1 text-[length:var(--fs-12)]">
      <p className="flex flex-wrap items-center gap-2">
        {search.found ? <Tag tone="ok">βρέθηκε</Tag> : <Tag>δεν βρέθηκε</Tag>}
        <span>
          Μοντέλο από τον τίτλο: {search.slugs.length > 0 ? search.slugs.join(", ") : "κανένα"}
          {search.sitemapCached ? " · χάρτης από τη μνήμη" : ""}
        </span>
      </p>
      {search.stoppedBy && <p className="text-k-red">Σταμάτησε: {search.stoppedBy}</p>}
      {search.candidates.length === 0 ? (
        <p className="text-k-text-3">Καμία σελίδα του χάρτη δεν ταιριάζει στο μοντέλο.</p>
      ) : (
        <ul className="space-y-0.5">
          {search.candidates.map((url) => {
            const page = search.pages.find((p) => p.url === url);
            return (
              <li key={url} className="break-all text-k-text-2">
                {url} ·{" "}
                {page
                  ? `HTTP ${page.status ?? "—"}, ${page.variants} κωδικοί${page.articleNumbers.length > 0 ? ` (${page.articleNumbers.join(", ")})` : ""}`
                  : "δεν χρειάστηκε"}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
