"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shimmer } from "@/components/skeleton/Skeleton";
import { LEVEL_LABEL, type PeersSuggestion, type XmlPricingMode } from "@/lib/hdctool/milwaukee-admin-contract";
import { eshopPriceWithVat, marginPct, priceWFor } from "@/lib/hdctool/milwaukee-admin-pricing";
import { cn } from "@/lib/utils";
import { money, pct, ratio } from "./format";
import { Tag } from "./kit";

export type PricingState = {
  mode: XmlPricingMode;
  markupPct: string;
  manualPriceW: string;
  utbl02: 1001 | 1002;
  /** Ο χρήστης διάλεξε UTBL02 με το χέρι (αλλιώς η πρόταση το ορίζει). */
  utbl02Touched: boolean;
};

const MODES: Array<{ key: XmlPricingMode; label: string }> = [
  { key: "SUGGESTED", label: "Πρόταση" },
  { key: "MARKUP", label: "Ποσοστό" },
  { key: "MANUAL", label: "Χειροκίνητη PRICEW" },
];

/** «66,67» ή «66.67» → 66.67· κενό ή άκυρο → null. */
export const parseDecimal = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() && Number.isFinite(n) ? n : null;
};

/** Η PRICEW που θα βγει με τις τρέχουσες επιλογές, για την προεπισκόπηση. */
export function previewPriceW(
  state: PricingState,
  costNet: number,
  suggestion: PeersSuggestion | undefined,
  current: number | null,
) {
  const none = { suggestedRatio: null, markupPct: null, manualPriceW: null };
  if (state.mode === "SUGGESTED") {
    if (suggestion === undefined) return current;
    return priceWFor({ ...none, mode: "SUGGESTED", costNet, suggestedRatio: suggestion?.ratio ?? null });
  }
  if (state.mode === "MARKUP") {
    return priceWFor({ ...none, mode: "MARKUP", costNet, markupPct: parseDecimal(state.markupPct) });
  }
  return priceWFor({ ...none, mode: "MANUAL", costNet, manualPriceW: parseDecimal(state.manualPriceW) });
}

/**
 * Τρόπος τιμής, πρόταση με τα ομοειδή, UTBL02 και ζωντανή προεπισκόπηση της
 * τιμής eshop και του περιθωρίου — με τους ίδιους τύπους με το HDCtool.
 */
export function PricingEditor({
  costNet,
  currentPriceW,
  suggestion,
  value,
  onChange,
  disabled,
}: {
  costNet: number;
  currentPriceW: number | null;
  /** `undefined` όσο φορτώνει, `null` όταν δεν υπάρχει πρόταση. */
  suggestion: PeersSuggestion | undefined;
  value: PricingState;
  onChange: (next: PricingState) => void;
  disabled?: boolean;
}) {
  const priceW = previewPriceW(value, costNet, suggestion, currentPriceW);
  // Στην «Πρόταση» το UTBL02 ακολουθεί την πρόταση (το HDCtool απορρίπτει χειροκίνητη τιμή).
  const followsSuggestion = value.mode === "SUGGESTED";
  const utbl02 = followsSuggestion && suggestion ? suggestion.utbl02 : value.utbl02;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-px border border-k-line bg-k-line" role="radiogroup" aria-label="Τρόπος τιμής">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={value.mode === m.key}
            disabled={disabled}
            onClick={() => onChange({ ...value, mode: m.key })}
            className={cn(
              "min-h-9 flex-1 px-3 text-[length:var(--fs-12-5)] font-medium transition-colors disabled:opacity-60",
              value.mode === m.key ? "bg-k-ink text-white" : "bg-white text-k-text-2 hover:bg-k-surface-3",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {value.mode === "SUGGESTED" &&
        (suggestion === undefined ? (
          <Shimmer className="h-24 w-full" />
        ) : suggestion === null ? (
          <p className="text-[length:var(--fs-12)] text-k-text-3">
            Δεν υπάρχουν ομοειδή για πρόταση· διαλέξτε ποσοστό ή χειροκίνητη τιμή.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="flex flex-wrap items-center gap-2 text-[length:var(--fs-12)]">
              <span className="numeral font-semibold text-k-ink">{ratio(suggestion.ratio)}</span>
              <span className="text-k-text-3">{LEVEL_LABEL[suggestion.level] ?? suggestion.level}</span>
              {suggestion.lowConfidence && <Tag tone="wait">χαμηλή βεβαιότητα</Tag>}
            </p>
            <ul className="max-h-52 divide-y divide-k-line overflow-y-auto border border-k-line" aria-label="Ομοειδή">
              {suggestion.peers.map((p) => (
                <li key={p.mtrl} className="px-2.5 py-1.5 text-[length:var(--fs-12)]">
                  <p className="truncate text-k-ink" title={p.name}>
                    <span className="font-mono text-k-text-3">{p.code2 ?? p.mtrl}</span> · {p.name}
                  </p>
                  <p className="numeral text-k-text-3">
                    XML {money(p.costNet)} · PRICEW {money(p.priceW)} · {ratio(p.ratio)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}

      {value.mode === "MARKUP" && (
        <div className="space-y-1">
          <Label htmlFor="xml-markup" className="text-[length:var(--fs-12)] text-k-text-3">
            Ποσοστό επί του κόστους (%)
          </Label>
          <Input
            id="xml-markup"
            inputMode="decimal"
            value={value.markupPct}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, markupPct: e.target.value })}
            placeholder="π.χ. 66,67"
          />
        </div>
      )}

      {value.mode === "MANUAL" && (
        <div className="space-y-1">
          <Label htmlFor="xml-manual" className="text-[length:var(--fs-12)] text-k-text-3">
            PRICEW (χωρίς ΦΠΑ)
          </Label>
          <Input
            id="xml-manual"
            inputMode="decimal"
            value={value.manualPriceW}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, manualPriceW: e.target.value })}
          />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-[length:var(--fs-12)] text-k-text-3">UTBL02 (κατηγορία έκπτωσης)</Label>
        <Select
          value={String(utbl02)}
          disabled={disabled || followsSuggestion}
          onValueChange={(v) => onChange({ ...value, utbl02: v === "1002" ? 1002 : 1001, utbl02Touched: true })}
        >
          <SelectTrigger className="w-full" aria-label="UTBL02, κατηγορία έκπτωσης">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1001">1001 (×0,88)</SelectItem>
            <SelectItem value="1002">1002 (×0,95)</SelectItem>
          </SelectContent>
        </Select>
        {followsSuggestion && (
          <p className="text-[length:var(--fs-11)] text-k-text-4">
            Στην «Πρόταση» το UTBL02 ακολουθεί την πρόταση. Με «Ποσοστό» ή «Χειροκίνητη» το διαλέγετε εσείς.
          </p>
        )}
      </div>

      {/* Ίδιοι τύποι με το HDCtool: PRICEW × έκπτωση UTBL02 × 1,24 (milwaukee-admin-pricing). */}
      <dl className="grid grid-cols-3 gap-px border border-k-line bg-k-line text-[length:var(--fs-12)]">
        <div className="bg-k-surface-3 p-2.5">
          <dt className="text-k-text-3">PRICEW</dt>
          <dd className="numeral font-semibold text-k-ink">{money(priceW)}</dd>
        </div>
        <div className="bg-k-surface-3 p-2.5">
          <dt className="text-k-text-3">Eshop με ΦΠΑ</dt>
          <dd className="numeral font-semibold text-k-ink">{money(eshopPriceWithVat(priceW, utbl02))}</dd>
        </div>
        <div className="bg-k-surface-3 p-2.5">
          <dt className="text-k-text-3">Περιθώριο</dt>
          <dd className="numeral font-semibold text-k-ink">{pct(marginPct(priceW, costNet))}</dd>
        </div>
      </dl>
    </div>
  );
}
