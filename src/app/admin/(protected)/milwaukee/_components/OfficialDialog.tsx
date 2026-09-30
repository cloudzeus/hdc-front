"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Globe, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OfficialSearchResult, OfficialView } from "@/lib/hdctool/milwaukee-admin-contract";
import { milwaukeeSearchOfficial } from "../actions";
import { attempt, read } from "./format";
import { LoadError } from "./kit";
import { OfficialIndex, OfficialProduct, OfficialSearch } from "./OfficialView";

/** «Επίσημα δεδομένα Milwaukee»: η γραμμή του ευρετηρίου για τον κωδικό, ενημέρωση και αναζήτηση. */
export function OfficialDialog({ itemId, canEdit }: { itemId: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<OfficialView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState<OfficialSearchResult | null>(null);

  /** Φόρτωση όταν ανοίγει ο διάλογος και με το «Ξανά»· απαντήσεις μετά το κλείσιμο αγνοούνται. */
  const load = async () => {
    setData(null);
    setError(null);
    setSearch(null);
    const r = await read<{ official: OfficialView }>("official", itemId);
    if (r.ok) setData(r.official);
    else setError(r.error);
  };

  const show = () => {
    setOpen(true);
    void load();
  };

  const runSearch = async () => {
    setSearching(true);
    const r = await attempt(() => milwaukeeSearchOfficial(itemId));
    setSearching(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setSearch(r.search);
    if (r.official) setData(r.official);
    if (r.search.found) toast.success("Βρέθηκε στο επίσημο site");
    else toast.info("Δεν βρέθηκε ο κωδικός");
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={show}>
        <Globe className="size-4" aria-hidden />
        Επίσημα δεδομένα Milwaukee
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="wide" className="max-h-[90vh] overflow-y-auto rounded-none border-k-line">
          <DialogHeader>
            <DialogTitle>Επίσημα δεδομένα Milwaukee</DialogTitle>
            <DialogDescription>
              Από το milwaukeetool.eu για τον κωδικό <span className="font-mono">{data?.articleNumber ?? "…"}</span>.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <LoadError title="Τα επίσημα στοιχεία δεν φόρτωσαν." message={error} onRetry={() => void load()} />
          ) : !data ? (
            <Loader2 className="size-5 animate-spin text-k-text-4" aria-label="Φόρτωση" />
          ) : (
            <div className="min-w-0 space-y-4">
              {data.product ? (
                <OfficialProduct product={data.product} />
              ) : (
                <p className="text-[length:var(--fs-12-5)] font-medium text-k-ink">Δεν βρέθηκε στο ευρετήριο.</p>
              )}
              <OfficialIndex index={data.index} canEdit={canEdit} />
              {canEdit && (
                <div className="space-y-2">
                  <Button type="button" size="sm" variant="outline" disabled={searching} onClick={() => void runSearch()}>
                    {searching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
                    Αναζήτηση στο επίσημο site
                  </Button>
                  {searching && (
                    <p className="text-[length:var(--fs-12)] text-k-text-3">
                      Έως 3 σελίδες με παύση 2″ ανάμεσα· μπορεί να πάρει ως 2 λεπτά.
                    </p>
                  )}
                  {search && <OfficialSearch search={search} />}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
