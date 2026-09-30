"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, TriangleAlert, CircleCheck, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Check } from "@/lib/seo/seo-checks";
import type { FaqPair } from "@/lib/seo/product-faq";
import { cn } from "@/lib/utils";

/**
 * Pieces shared by the «SEO & Περιεχόμενο» editors: a labelled field with a
 * character or word count, the FAQ list, a one-per-line list, and the checks.
 */

export function Field({
  id,
  label,
  hint,
  count,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  /** «42/60» — red when over. */
  count?: { value: number; max: number; unit?: string; min?: number };
  children: React.ReactNode;
}) {
  const over = count && (count.value > count.max || (count.min != null && count.value > 0 && count.value < count.min));
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[length:var(--fs-13)] font-medium text-k-ink">
          {label}
        </label>
        {count && (
          <span className={cn("numeral text-[length:var(--fs-11)]", over ? "font-semibold text-k-red" : "text-k-text-4")}>
            {count.value}
            {count.min != null ? `/${count.min}–${count.max}` : `/${count.max}`} {count.unit ?? "χαρ."}
          </span>
        )}
      </div>
      {children}
      {hint && <p className="text-[length:var(--fs-11)] leading-[1.5] text-k-text-3">{hint}</p>}
    </div>
  );
}

export const inputClass = "text-[length:var(--fs-13)]";

export function FaqEditor({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: FaqPair[];
  onChange: (next: FaqPair[]) => void;
  /** The automatic questions, shown when the list is empty. */
  placeholder?: FaqPair[];
  disabled?: boolean;
}) {
  const set = (index: number, patch: Partial<FaqPair>) =>
    onChange(value.map((pair, i) => (i === index ? { ...pair, ...patch } : pair)));
  const move = (index: number, step: number) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item);
    onChange(next);
  };
  return (
    <div className="grid gap-2">
      {value.length === 0 && placeholder && placeholder.length > 0 && (
        <div className="border border-dashed border-k-line bg-k-surface-2 p-3 text-[length:var(--fs-12)] text-k-text-3">
          <p className="mb-1 font-medium text-k-text-2">Αυτόματες ερωτήσεις (ισχύουν όσο η λίστα είναι κενή):</p>
          <ul className="list-disc pl-4">
            {placeholder.map((p) => (
              <li key={p.q}>{p.q}</li>
            ))}
          </ul>
        </div>
      )}
      {value.map((pair, index) => (
        <div key={index} className="grid gap-1.5 border border-k-line bg-white p-3">
          <div className="flex items-center gap-2">
            <Input
              aria-label={`Ερώτηση ${index + 1}`}
              value={pair.q}
              disabled={disabled}
              onChange={(e) => set(index, { q: e.target.value })}
              placeholder="Ερώτηση"
              className={inputClass}
            />
            <Button type="button" variant="outline" size="icon" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label="Πάνω">
              <ArrowUp aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled || index === value.length - 1}
              onClick={() => move(index, 1)}
              aria-label="Κάτω"
            >
              <ArrowDown aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              aria-label="Αφαίρεση"
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
          <Textarea
            aria-label={`Απάντηση ${index + 1}`}
            value={pair.a}
            disabled={disabled}
            onChange={(e) => set(index, { a: e.target.value })}
            placeholder="Απάντηση (μία παράγραφος)"
            className={inputClass}
          />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit" disabled={disabled} onClick={() => onChange([...value, { q: "", a: "" }])}>
        <Plus aria-hidden />
        Ερώτηση
      </Button>
    </div>
  );
}

/** A list edited as one item per line. */
export function LinesField({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <Field id={id} label={label} hint={hint}>
      <Textarea
        id={id}
        value={value.join("\n")}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.split("\n"))}
        className={cn(inputClass, "min-h-20 font-mono")}
      />
    </Field>
  );
}

export function ChecksList({ checks, broken = [] }: { checks: Check[]; broken?: string[] }) {
  if (checks.length === 0 && broken.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[length:var(--fs-12)] text-[var(--hdc-ok)]">
        <CircleCheck className="size-4" aria-hidden />
        Κανένα πρόβλημα.
      </p>
    );
  }
  return (
    <ul className="grid gap-1.5" aria-live="polite">
      {checks.map((c, i) => (
        <li key={i} className={cn("flex items-start gap-1.5 text-[length:var(--fs-12)]", c.level === "error" ? "text-k-red" : "text-[var(--hdc-wait)]")}>
          {c.level === "error" ? <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
          {c.message}
        </li>
      ))}
      {broken.map((path) => (
        <li key={path} className="flex items-start gap-1.5 text-[length:var(--fs-12)] text-k-red">
          <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />
          Σύνδεσμος σε σελίδα που δεν υπάρχει: <code className="font-mono">{path}</code>
        </li>
      ))}
    </ul>
  );
}

/** How a result could look on Google: title, address, description. */
export function SerpPreview({ title, url, description }: { title: string; url: string; description: string }) {
  return (
    <div className="max-w-[600px] border border-k-line bg-white p-3" aria-label="Προεπισκόπηση αποτελέσματος Google">
      <p className="truncate text-[length:var(--fs-12)] text-k-text-3">{url}</p>
      <p className="mt-0.5 line-clamp-1 text-[length:var(--fs-17)] leading-snug text-[#1a0dab]">{title}</p>
      <p className="mt-1 line-clamp-2 text-[length:var(--fs-13)] leading-[1.5] text-k-text-2">{description}</p>
    </div>
  );
}
