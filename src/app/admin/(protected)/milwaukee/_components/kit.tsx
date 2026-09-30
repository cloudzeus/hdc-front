"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, KeyRound, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Μικρά κομμάτια της ενότητας Milwaukee, στο ύφος του διαχειριστικού:
 * ορθογώνια, λευκά πάνω στο γκρι φόντο, tokens `k-*` και `var(--fs-N)`.
 */

export type Tone = "neutral" | "ok" | "wait" | "danger" | "info" | "outline";

const TONE: Record<Tone, string> = {
  neutral: "border-k-line bg-k-surface-3 text-k-text-2",
  ok: "border-transparent bg-[var(--hdc-ok)]/10 text-[var(--hdc-ok)]",
  wait: "border-transparent bg-[var(--hdc-wait)]/10 text-[var(--hdc-wait)]",
  danger: "border-transparent bg-k-red/10 text-k-red",
  info: "border-transparent bg-k-blue/10 text-k-blue",
  outline: "border-k-line bg-white text-k-text-2",
};

/** Ετικέτα κατάστασης. */
export function Tag({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 border px-1.5 py-px text-[length:var(--fs-11)] font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Σφάλμα κλειδιού: ίδιο κείμενο με τον client (`BAD_KEY_ERROR`/`MISSING_KEY_ERROR`). */
const isKeyMessage = (message: string) => message.includes("HDC_ADMIN_API_KEY");

/**
 * Σφάλμα φόρτωσης με «Ξανά» αντί για σκελετό που δεν τελειώνει. Χωρίς
 * `onRetry` ξαναφορτώνει τη σελίδα από τον server (`router.refresh()`).
 */
export function LoadError({
  title,
  message,
  onRetry,
  className,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const keyProblem = isKeyMessage(message);
  const Icon = keyProblem ? KeyRound : TriangleAlert;
  return (
    <div role="alert" className={cn("border border-l-[3px] border-k-line border-l-k-amber bg-white p-4", className)}>
      <div className="flex flex-wrap items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-k-amber" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--fs-13)] font-semibold text-k-ink">{title}</p>
          <p className="mt-0.5 break-words text-[length:var(--fs-12-5)] text-k-text-2">{message}</p>
          {keyProblem && (
            <p className="mt-1 text-[length:var(--fs-12)] leading-[1.5] text-k-text-3">
              Το κλειδί είναι το ίδιο με το <code className="font-mono">HDC_ADMIN_API_KEY</code> του HDCtool και ορίζεται
              στο περιβάλλον του hdc-front (τοπικά στο .env, στην παραγωγή στο Coolify).
            </p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => (onRetry ? onRetry() : router.refresh())}>
          <RotateCcw className="size-4" aria-hidden />
          Ξανά
        </Button>
      </div>
    </div>
  );
}

export const PAGE_SIZE = 50;

export function pageSlice<T>(rows: T[], page: number): T[] {
  return rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

/** Σελιδοποίηση στον browser, 50 ανά σελίδα. */
export function TablePager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="flex items-center justify-between gap-2 border-t border-k-line px-4 py-2">
      <p className="numeral text-[length:var(--fs-12)] text-k-text-3">
        {total > PAGE_SIZE ? `Σελίδα ${page} από ${pages} · ` : ""}
        {total.toLocaleString("el-GR")} γραμμές
      </p>
      {total > PAGE_SIZE && (
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="size-4" aria-hidden />
            <span className="sr-only">Προηγούμενη</span>
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <ChevronRight className="size-4" aria-hidden />
            <span className="sr-only">Επόμενη</span>
          </Button>
        </div>
      )}
    </div>
  );
}

/** Ράβδος προόδου: ορθογώνια, με τον αριθμό δίπλα. */
export function ProgressBar({ value, of, label }: { value: number; of: number; label: string }) {
  const share = of > 0 ? Math.min(1, Math.max(0, value / of)) : 0;
  const percent = Math.round(share * 1000) / 10;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[length:var(--fs-12)]">
        <span className="text-k-text-2">{label}</span>
        <span className="numeral text-k-ink">
          {value.toLocaleString("el-GR")} / {of.toLocaleString("el-GR")} · {percent.toLocaleString("el-GR")}%
        </span>
      </div>
      <div
        className="mt-1.5 h-2 w-full bg-k-surface-3"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={of}
        aria-valuenow={value}
      >
        <div className="h-full bg-k-ink transition-[width]" style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

/** Τίτλος ενότητας μέσα σε πάνελ ή sheet. */
export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-[length:var(--fs-13)] font-semibold tracking-tight text-k-ink">{children}</h3>
      {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
    </div>
  );
}

/** Κουτί ειδοποίησης. */
export function Notice({
  tone,
  children,
  className,
}: {
  tone: "info" | "warn" | "danger";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border border-l-[3px] p-2.5 text-[length:var(--fs-12)] leading-[1.5]",
        tone === "info" && "border-k-line border-l-k-blue bg-white text-k-text-2",
        tone === "warn" && "border-k-line border-l-k-amber bg-k-gold-tint text-k-ink",
        tone === "danger" && "border-k-line border-l-k-red bg-white text-k-red",
        className,
      )}
    >
      {children}
    </div>
  );
}
