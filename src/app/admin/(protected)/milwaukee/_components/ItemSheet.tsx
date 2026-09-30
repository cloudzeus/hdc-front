"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Archive, Languages, Loader2, Power, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { Shimmer } from "@/components/skeleton/Skeleton";
import {
  MISSING_LABEL,
  STATUS_LABEL,
  type ItemPatch,
  type PeersSuggestion,
  type SoftOneCategories,
  type XmlItemDetail,
} from "@/lib/hdctool/milwaukee-admin-contract";
import {
  milwaukeeAnalyze,
  milwaukeeBulkActivate,
  milwaukeeBulkArchive,
  milwaukeeTranslate,
  milwaukeeUpdateContent,
  milwaukeeUpdateItem,
} from "../actions";
import { attempt, money, read, when } from "./format";
import { LoadError, SectionTitle, Tag } from "./kit";
import { CategoryPicker, type PartialChoice } from "./CategoryPicker";
import { PricingEditor, parseDecimal, type PricingState } from "./PricingEditor";
import { ContentEditor, XmlDescription, type ContentState } from "./ContentEditor";
import { AnalysisDialog } from "./AnalysisDialog";
import { OfficialDialog } from "./OfficialDialog";
import { ErpRegisterDialog } from "./ErpRegisterDialog";

type Names = { nameEl: string; nameEn: string; nameIt: string };
const EMPTY_CONTENT = { features: [], specs: [] };

function initial(detail: XmlItemDetail) {
  return {
    names: { nameEl: detail.nameEl, nameEn: detail.nameEn ?? "", nameIt: detail.nameIt ?? "" } as Names,
    choice: { mtrcategory: detail.mtrcategory, mtrgroup: detail.mtrgroup, cccSubgroup2: detail.cccSubgroup2 } as PartialChoice,
    pricing: {
      mode: detail.pricingMode,
      markupPct: detail.markupPct == null ? "" : String(detail.markupPct),
      manualPriceW: detail.priceW == null ? "" : String(detail.priceW),
      utbl02: detail.utbl02 === 1002 ? 1002 : 1001,
      utbl02Touched: false,
    } as PricingState,
    content: {
      el: detail.contentEl ?? EMPTY_CONTENT,
      en: detail.contentEn ?? EMPTY_CONTENT,
      it: detail.contentIt ?? EMPTY_CONTENT,
    } as ContentState,
  };
}

const missingText = (detail: XmlItemDetail) => detail.missing.map((m) => MISSING_LABEL[m]).join(", ");

/**
 * Πλαϊνό πάνελ ενός προϊόντος μόνο-XML: ονόματα και μετάφραση, κατηγορία
 * SoftOne, τιμή με προεπισκόπηση, περιεχόμενο ανά γλώσσα, ανάλυση με AI,
 * επίσημα στοιχεία, ενεργοποίηση/απόσυρση και «Καταχώριση στο SoftOne».
 * Χωρίς `milwaukee.edit` όλα είναι μόνο για ανάγνωση.
 */
export function ItemSheet({
  itemId,
  categories,
  canEdit,
  canErp,
  onOpenChange,
  onChanged,
}: {
  itemId: string | null;
  categories: SoftOneCategories | null;
  canEdit: boolean;
  canErp: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<XmlItemDetail | null>(null);
  const [suggestion, setSuggestion] = useState<PeersSuggestion | undefined>(undefined);
  const [names, setNames] = useState<Names>({ nameEl: "", nameEn: "", nameIt: "" });
  const [choice, setChoice] = useState<PartialChoice>({ mtrcategory: null, mtrgroup: null, cccSubgroup2: null });
  const [pricing, setPricing] = useState<PricingState | null>(null);
  const [content, setContent] = useState<ContentState | null>(null);
  const [contentDirty, setContentDirty] = useState(false);
  const [dropped, setDropped] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirmAnalyze, setConfirmAnalyze] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Το item που δείχνει τώρα το πάνελ: απαντήσεις για προηγούμενο item αγνοούνται.
  const current = useRef<string | null>(null);

  const apply = useCallback((item: XmlItemDetail) => {
    const init = initial(item);
    setDetail(item);
    setNames(init.names);
    setChoice(init.choice);
    setPricing(init.pricing);
    setContent(init.content);
    setContentDirty(false);
  }, []);

  /** Φορτώνει το item· `false` αν απέτυχε (το μήνυμα πάει στο `loadError` ή σε toast). */
  const load = useCallback(
    async (id: string, { quiet = false } = {}) => {
      const r = await read<{ item: XmlItemDetail }>("item", id);
      if (current.current !== id) return false;
      if (r.ok) {
        apply(r.item);
        return true;
      }
      if (quiet) toast.error(`Η ανανέωση απέτυχε: ${r.error}`);
      else setLoadError(r.error);
      return false;
    },
    [apply],
  );

  const loadSuggestion = useCallback((id: string) => {
    void read<{ suggestion: PeersSuggestion }>("peers", id).then((r) => {
      if (current.current === id) setSuggestion(r.ok ? r.suggestion : null);
    });
  }, []);

  // Ο γονέας δίνει `key={itemId}`: κάθε προϊόν ανοίγει με καθαρή κατάσταση.
  useEffect(() => {
    current.current = itemId;
    if (!itemId) return;
    void read<{ item: XmlItemDetail }>("item", itemId).then((r) => {
      if (current.current !== itemId) return;
      if (r.ok) apply(r.item);
      else setLoadError(r.error);
    });
    loadSuggestion(itemId);
  }, [itemId, apply, loadSuggestion]);

  const retry = () => {
    if (!itemId) return;
    setLoadError(null);
    void load(itemId);
  };

  const categoryChanged =
    detail != null &&
    (choice.mtrcategory !== detail.mtrcategory ||
      choice.mtrgroup !== detail.mtrgroup ||
      choice.cccSubgroup2 !== detail.cccSubgroup2);

  const dirty = useMemo(() => {
    if (!detail || !pricing || !content) return false;
    const init = initial(detail);
    return (
      contentDirty ||
      categoryChanged ||
      JSON.stringify(names) !== JSON.stringify(init.names) ||
      JSON.stringify(pricing) !== JSON.stringify(init.pricing)
    );
  }, [detail, names, pricing, content, contentDirty, categoryChanged]);

  /** Αποθήκευση· `true` όταν πέτυχε. */
  const saveNow = async (): Promise<boolean> => {
    if (!detail || !pricing || !content) return false;
    if (categoryChanged && (choice.mtrcategory == null) !== (choice.mtrgroup == null)) {
      toast.error("Διαλέξτε κατηγορία και ομάδα, ή καθαρίστε και τα δύο");
      return false;
    }
    if (pricing.mode === "MARKUP" && parseDecimal(pricing.markupPct) == null) {
      toast.error("Δώστε ποσοστό για την τιμή «Ποσοστό»");
      return false;
    }
    const patch: ItemPatch = {
      nameEl: names.nameEl,
      nameEn: names.nameEn,
      nameIt: names.nameIt,
      pricingMode: pricing.mode,
    };
    if (pricing.mode === "MARKUP") patch.markupPct = parseDecimal(pricing.markupPct);
    if (pricing.mode === "MANUAL") patch.priceW = parseDecimal(pricing.manualPriceW);
    // Στην «Πρόταση» το UTBL02 ακολουθεί την πρόταση και δεν στέλνεται.
    if (pricing.mode !== "SUGGESTED" && pricing.utbl02Touched) patch.utbl02 = pricing.utbl02;
    if (categoryChanged) {
      patch.category =
        choice.mtrcategory == null || choice.mtrgroup == null
          ? null
          : { mtrcategory: choice.mtrcategory, mtrgroup: choice.mtrgroup, cccSubgroup2: choice.cccSubgroup2 };
    }

    const r = await attempt(() => milwaukeeUpdateItem(detail.id, patch));
    if (!r.ok) {
      toast.error(`Η αποθήκευση απέτυχε: ${r.error}`);
      return false;
    }
    if (contentDirty) {
      const c = await attempt(() => milwaukeeUpdateContent(detail.id, content));
      if (!c.ok) {
        toast.error(`Περιεχόμενο: ${c.error}`);
        return false;
      }
    }
    toast.success("Αποθηκεύτηκε");
    await load(detail.id, { quiet: true });
    // Νέα πρόταση: μπορεί να άλλαξε όνομα ή κατηγορία.
    loadSuggestion(detail.id);
    onChanged();
    return true;
  };

  const withPending = async (fn: () => Promise<unknown>) => {
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  };

  const save = () => void withPending(saveNow);

  const translate = () =>
    void withPending(async () => {
      if (!detail) return;
      const r = await attempt(() => milwaukeeTranslate(detail.id));
      if (!r.ok) {
        toast.error(`Η μετάφραση απέτυχε: ${r.error}`);
        return;
      }
      setNames((n) => ({ ...n, nameEn: r.nameEn, nameIt: r.nameIt }));
      toast.success("Μεταφράστηκε· αποθηκεύτηκε στο HDCtool");
      onChanged();
    });

  const analyzeNow = async () => {
    if (!detail) return;
    setAnalyzing(true);
    const r = await attempt(() => milwaukeeAnalyze(detail.id));
    setAnalyzing(false);
    if (!r.ok) {
      toast.error(`Η ανάλυση απέτυχε: ${r.error}`);
      return;
    }
    toast.success(r.written ? "Η ανάλυση ολοκληρώθηκε" : "Η ανάλυση δεν γράφτηκε (χειροκίνητο περιεχόμενο)");
    await load(detail.id, { quiet: true });
    setDropped(r.dropped);
    onChanged();
  };

  /** Με αλλαγές που δεν αποθηκεύτηκαν, πρώτα ερώτηση: αποθήκευση ή απόρριψη. */
  const analyze = () => {
    if (dirty) setConfirmAnalyze(true);
    else void analyzeNow();
  };

  const setStatus = (activate: boolean) =>
    void withPending(async () => {
      if (!detail) return;
      if (activate && (dirty || detail.missing.length > 0)) {
        toast.error(dirty ? "Αποθηκεύστε πρώτα τις αλλαγές" : `Λείπει ${missingText(detail)}· αποθηκεύστε πρώτα`);
        return;
      }
      if (activate) {
        const r = await attempt(() => milwaukeeBulkActivate([detail.id]));
        if (!r.ok) {
          toast.error(`Η ενεργοποίηση απέτυχε: ${r.error}`);
          return;
        }
        if (r.skipped.length > 0) {
          toast.error(`Δεν ενεργοποιήθηκε: λείπει ${r.skipped[0]!.missing.map((m) => MISSING_LABEL[m]).join(", ")}`);
        } else {
          toast.success("Ενεργοποιήθηκε");
        }
      } else {
        const r = await attempt(() => milwaukeeBulkArchive([detail.id]));
        if (!r.ok) {
          toast.error(`Η απόσυρση απέτυχε: ${r.error}`);
          return;
        }
        toast.success("Αποσύρθηκε");
      }
      await load(detail.id, { quiet: true });
      onChanged();
    });

  return (
    <Sheet open={itemId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 border-k-line p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-k-line">
          <SheetTitle className="pr-6 text-[length:var(--fs-15)] leading-snug text-k-ink">
            {detail?.xmlTitle ?? detail?.nameEl ?? "Προϊόν μόνο-XML"}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-12)] text-k-text-3">
              {detail ? (
                <>
                  <span className="font-mono">{detail.alternativeCode}</span>
                  <Tag tone="outline">{STATUS_LABEL[detail.status]}</Tag>
                  {detail.missing.length > 0 && <span>λείπει {missingText(detail)}</span>}
                  {detail.mtrl != null && (
                    <Tag tone="ok">
                      SoftOne MTRL {detail.mtrl}
                      {detail.createdInSoftOneAt ? ` · ${when(detail.createdInSoftOneAt)}` : ""}
                      {detail.createdInSoftOneBy ? ` · ${detail.createdInSoftOneBy}` : ""}
                    </Tag>
                  )}
                </>
              ) : loadError ? (
                "—"
              ) : (
                "Φόρτωση…"
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        {!detail && loadError ? (
          <div className="p-4">
            <LoadError title="Το προϊόν δεν φόρτωσε." message={loadError} onRetry={retry} />
          </div>
        ) : !detail || !pricing || !content ? (
          <div className="space-y-3 p-4">
            <Shimmer className="h-24 w-full" />
            <Shimmer className="h-40 w-full" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            <section className="space-y-2" aria-label="Ονόματα">
              <SectionTitle
                aside={
                  canEdit && (
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={translate}>
                      <Languages className="size-4" aria-hidden />
                      Μετάφραση
                    </Button>
                  )
                }
              >
                Ονόματα
              </SectionTitle>
              {(["nameEl", "nameEn", "nameIt"] as const).map((key) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={key} className="text-[length:var(--fs-12)] text-k-text-3">
                    {key === "nameEl" ? "Ελληνικά" : key === "nameEn" ? "English" : "Italiano"}
                  </Label>
                  <Input
                    id={key}
                    value={names[key]}
                    maxLength={500}
                    disabled={!canEdit}
                    onChange={(e) => setNames({ ...names, [key]: e.target.value })}
                  />
                </div>
              ))}
            </section>

            <section className="space-y-2 border-t border-k-line pt-4" aria-label="Κατηγορία SoftOne">
              <SectionTitle>Κατηγορία SoftOne</SectionTitle>
              {categories ? (
                <CategoryPicker data={categories} value={choice} onChange={setChoice} disabled={!canEdit} />
              ) : (
                <p className="text-[length:var(--fs-12)] text-k-text-3">
                  {detail.categoryPath ?? "—"} · οι κατηγορίες του SoftOne δεν φόρτωσαν.
                </p>
              )}
            </section>

            <section className="space-y-2 border-t border-k-line pt-4" aria-label="Τιμή">
              <SectionTitle>
                Τιμή <span className="font-normal text-k-text-3">· αγορά {money(detail.costNet)}</span>
              </SectionTitle>
              <PricingEditor
                costNet={detail.costNet}
                currentPriceW={detail.priceW}
                suggestion={suggestion}
                value={pricing}
                onChange={setPricing}
                disabled={!canEdit}
              />
            </section>

            <section className="space-y-2 border-t border-k-line pt-4" aria-label="Περιεχόμενο">
              <SectionTitle
                aside={
                  <>
                    <AnalysisDialog itemId={detail.id} />
                    <OfficialDialog itemId={detail.id} canEdit={canEdit} />
                  </>
                }
              >
                Χαρακτηριστικά και τεχνικά
              </SectionTitle>
              <ContentEditor
                key={detail.id + (detail.contentAnalyzedAt ?? "")}
                detail={detail}
                value={content}
                onChange={(c) => {
                  setContent(c);
                  setContentDirty(true);
                }}
                onAnalyze={analyze}
                analyzing={analyzing}
                dropped={dropped}
                canEdit={canEdit}
              />
            </section>

            <section className="border-t border-k-line pt-4">
              <XmlDescription key={detail.id} detail={detail} />
            </section>

            <section className="space-y-2 border-t border-k-line pt-4" aria-label="Από το XML">
              <SectionTitle>Από το XML</SectionTitle>
              <p className="text-[length:var(--fs-12-5)] text-k-ink">{detail.xmlTitle ?? "—"}</p>
              <p className="text-[length:var(--fs-12)] text-k-text-3">{detail.xmlCategory ?? "—"}</p>
              {detail.gallery.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {detail.gallery.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block size-20 overflow-hidden border border-k-line bg-white"
                    >
                      {/* Φωτογραφίες από τον server του προμηθευτή· απλό <img>, χωρίς remotePatterns. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="size-full object-contain" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {detail && canErp && detail.mtrl == null && detail.erpBlockers.length > 0 && (
          <p className="border-t border-k-line px-4 pt-2 text-[length:var(--fs-12)] text-k-text-3">
            Για την καταχώριση στο SoftOne: {detail.erpBlockers.join(" · ")}
          </p>
        )}
        {detail && (canEdit || canErp) && (
          <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t border-k-line [&>button]:grow sm:[&>button]:grow-0">
            {canEdit &&
              (detail.status === "ACTIVE" ? (
                <Button type="button" variant="outline" disabled={pending} onClick={() => setStatus(false)}>
                  <Archive className="size-4" aria-hidden />
                  Απόσυρση
                </Button>
              ) : (
                <Button type="button" variant="outline" disabled={pending} onClick={() => setStatus(true)}>
                  <Power className="size-4" aria-hidden />
                  Ενεργοποίηση
                </Button>
              ))}
            {canErp && detail.mtrl == null && (
              <ErpRegisterDialog
                itemId={detail.id}
                blockers={detail.erpBlockers}
                disabledReason={pending ? "Σε εξέλιξη" : dirty ? "Αποθηκεύστε πρώτα τις αλλαγές" : null}
                onDone={() => {
                  void load(detail.id, { quiet: true });
                  onChanged();
                }}
              />
            )}
            {canEdit && (
              <Button type="button" disabled={pending || !dirty} onClick={save}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                Αποθήκευση
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>

      <AlertDialog open={confirmAnalyze} onOpenChange={setConfirmAnalyze}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Υπάρχουν αλλαγές που δεν αποθηκεύτηκαν</AlertDialogTitle>
            <AlertDialogDescription>
              Η ανάλυση ξαναγράφει το περιεχόμενο από το XML ή τα επίσημα στοιχεία.{" "}
              {contentDirty
                ? "Άλλαξε το περιεχόμενο: αν το αποθηκεύσετε γίνεται «χειροκίνητο» και το AI δεν το ξαναγγίζει, άρα η ανάλυση θέλει να απορριφθούν οι αλλαγές."
                : "Αποθηκεύστε πρώτα ή απορρίψτε τις αλλαγές."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              onClick={() => {
                if (detail) apply(detail);
                void analyzeNow();
              }}
            >
              Απόρριψη και ανάλυση
            </AlertDialogAction>
            {!contentDirty && (
              <AlertDialogAction
                onClick={() =>
                  void withPending(async () => {
                    if (await saveNow()) await analyzeNow();
                  })
                }
              >
                Αποθήκευση και ανάλυση
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
