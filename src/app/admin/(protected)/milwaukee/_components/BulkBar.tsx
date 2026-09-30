"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Archive, BadgeCheck, FolderTree, Loader2, Power, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MISSING_LABEL,
  type BulkActivateOk,
  type SoftOneCategories,
  type XmlMissing,
} from "@/lib/hdctool/milwaukee-admin-contract";
import {
  milwaukeeBulkAcceptSuggested,
  milwaukeeBulkActivate,
  milwaukeeBulkArchive,
  milwaukeeBulkCategory,
} from "../actions";
import { attempt, isAborted, num, runJob, type Result } from "./format";
import { CategoryPicker, EMPTY_CHOICE, type PartialChoice } from "./CategoryPicker";

/**
 * Μαζικές ενέργειες στην επιλογή του πίνακα «Μόνο στο XML».
 *
 * Χωρίς μαζική «Καταχώριση στο SoftOne»: εδώ κάθε καταχώριση περνά από την
 * προεπισκόπησή της και στέλνει το αποτύπωμά της, άρα γίνεται ένα-ένα από το
 * πάνελ του προϊόντος.
 */
export function BulkBar({
  ids,
  categories,
  onDone,
  onClear,
}: {
  ids: string[];
  categories: SoftOneCategories | null;
  onDone: () => void;
  onClear: () => void;
}) {
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState<PartialChoice>(EMPTY_CHOICE);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const polling = useRef<AbortController | null>(null);
  useEffect(() => () => polling.current?.abort(), []);

  const run = <T extends object>(label: string, fn: () => Promise<Result<T>>, success: (r: T) => void) =>
    start(async () => {
      const r = await attempt(fn);
      if (isAborted(r)) return;
      if (!r.ok) {
        toast.error(`${label}: ${r.error}`);
        return;
      }
      success(r);
      onDone();
    });

  const setCategory = () => {
    if (choice.mtrcategory == null || choice.mtrgroup == null) {
      toast.error("Διαλέξτε κατηγορία και ομάδα");
      return;
    }
    const picked = { mtrcategory: choice.mtrcategory, mtrgroup: choice.mtrgroup, cccSubgroup2: choice.cccSubgroup2 };
    run(
      "Ορισμός κατηγορίας",
      () => milwaukeeBulkCategory(ids, picked),
      (r) => {
        toast.success(`Ορίστηκε κατηγορία σε ${num(r.updated)}`);
        setCategoryOpen(false);
        setChoice(EMPTY_CHOICE);
      },
    );
  };

  const acceptSuggested = () =>
    run("Αποδοχή τιμών", () => milwaukeeBulkAcceptSuggested(ids), (r) =>
      toast.success(`Προτεινόμενη τιμή σε ${num(r.updated)}`),
    );

  /** Έως 5′ στο HDCtool: εργασία στο παρασκήνιο, με ρώτημα κάθε 2,5″. */
  const startActivation = () => {
    const controller = new AbortController();
    polling.current = controller;
    return runJob<BulkActivateOk>(() => milwaukeeBulkActivate(ids), {
      signal: controller.signal,
      onReused: () => toast.info("Τρέχει ήδη μια ενεργοποίηση δική σας· περιμένουμε το αποτέλεσμά της."),
    });
  };

  const activate = () =>
    run("Ενεργοποίηση", startActivation, (r) => {
      toast.success(`Ενεργοποιήθηκαν ${num(r.activated)}`);
      if (r.skipped.length > 0) {
        const reasons = new Set<XmlMissing>(r.skipped.flatMap((s) => s.missing));
        toast.warning(
          `Δεν ενεργοποιήθηκαν ${num(r.skipped.length)}: λείπει ${[...reasons].map((m) => MISSING_LABEL[m]).join(", ")}`,
        );
      }
    });

  const archive = () =>
    run("Απόσυρση", () => milwaukeeBulkArchive(ids), (r) => {
      toast.success(`Αποσύρθηκαν ${num(r.archived)}`);
      setArchiveOpen(false);
    });

  return (
    <div
      className="flex flex-wrap items-center gap-2 border border-k-line border-l-[3px] border-l-k-ink bg-white px-4 py-2"
      role="region"
      aria-label="Μαζικές ενέργειες"
    >
      <span className="numeral text-[length:var(--fs-13)] font-semibold text-k-ink">{num(ids.length)} επιλεγμένα</span>
      {pending && <Loader2 className="size-4 animate-spin text-k-text-4" aria-label="Σε εξέλιξη" />}
      <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
        <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={pending || !categories}>
              <FolderTree className="size-4" aria-hidden />
              Ορισμός κατηγορίας
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] space-y-3" align="end">
            {categories && <CategoryPicker data={categories} value={choice} onChange={setChoice} />}
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={pending || choice.mtrcategory == null || choice.mtrgroup == null}
              onClick={setCategory}
            >
              Εφαρμογή σε {num(ids.length)}
            </Button>
          </PopoverContent>
        </Popover>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={acceptSuggested}>
          <BadgeCheck className="size-4" aria-hidden />
          Αποδοχή προτεινόμενων τιμών
        </Button>
        <Button type="button" size="sm" disabled={pending} onClick={activate}>
          <Power className="size-4" aria-hidden />
          Ενεργοποίηση
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setArchiveOpen(true)}>
          <Archive className="size-4" aria-hidden />
          Απόσυρση
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={pending}>
          <X className="size-4" aria-hidden />
          Καθαρισμός
        </Button>
      </div>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Απόσυρση {num(ids.length)} προϊόντων;</AlertDialogTitle>
            <AlertDialogDescription>
              Φεύγουν από το eshop με τον επόμενο συγχρονισμό. Μπορούν να ενεργοποιηθούν ξανά.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction onClick={archive}>Απόσυρση</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
