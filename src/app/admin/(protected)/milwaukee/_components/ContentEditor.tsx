"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CONTENT_SOURCE_LABEL,
  MAX_ANALYSIS_ATTEMPTS,
  MAX_FEATURES,
  MAX_SPECS,
  type XmlContent,
  type XmlItemDetail,
} from "@/lib/hdctool/milwaukee-admin-contract";
import { Notice, Tag } from "./kit";

export type Lang = "el" | "en" | "it";
export type ContentState = Record<Lang, XmlContent>;

const LANGS: Array<{ key: Lang; label: string }> = [
  { key: "el", label: "Ελληνικά" },
  { key: "en", label: "English" },
  { key: "it", label: "Italiano" },
];

/**
 * Χαρακτηριστικά και τεχνικά ανά γλώσσα, με την πηγή τους, τις αποκλίσεις
 * από τα επίσημα, την ένδειξη πίνακα και το «Ανάλυση με AI».
 */
export function ContentEditor({
  detail,
  value,
  onChange,
  onAnalyze,
  analyzing,
  dropped,
  canEdit,
}: {
  detail: XmlItemDetail;
  value: ContentState;
  onChange: (next: ContentState) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  dropped: string[] | null;
  canEdit: boolean;
}) {
  const manual = detail.contentSource === "manual";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="outline">{detail.contentSource ? CONTENT_SOURCE_LABEL[detail.contentSource] : "χωρίς περιεχόμενο"}</Tag>
        {detail.officialUrl && (
          <a
            href={detail.officialUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[length:var(--fs-12)] font-medium text-k-ink underline underline-offset-2 hover:text-k-red"
          >
            Σελίδα στο επίσημο site
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={analyzing || manual}
            title={manual ? "Το περιεχόμενο είναι χειροκίνητο· η ανάλυση δεν το αντικαθιστά" : undefined}
            onClick={onAnalyze}
          >
            {analyzing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            Ανάλυση με AI
          </Button>
        )}
      </div>

      {detail.analysisError && (
        <Notice tone="warn">
          {detail.analysisAttempts >= MAX_ANALYSIS_ATTEMPTS
            ? `Η αυτόματη ανάλυση σταμάτησε μετά από ${detail.analysisAttempts} αποτυχίες: `
            : "Τελευταία ανάλυση: "}
          {detail.analysisError}
        </Notice>
      )}

      {dropped && (
        <details open={dropped.length > 0} className="text-[length:var(--fs-12)]">
          <summary className="cursor-pointer font-medium text-k-ink">
            Απορρίφθηκαν ως μη επαληθεύσιμα: {dropped.length}
          </summary>
          {dropped.length === 0 ? (
            <p className="mt-1 text-k-text-3">Όλα επαληθεύτηκαν στην πηγή.</p>
          ) : (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-k-text-3">
              {dropped.map((d, i) => (
                <li key={i} className="break-words">
                  {d}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      {detail.discrepancies.length > 0 && (
        <Notice tone="danger">
          <p className="font-medium">Αποκλίσεις από τα επίσημα (υπερισχύουν τα επίσημα)</p>
          <ul className="mt-1 list-disc pl-5">
            {detail.discrepancies.map((d, i) => (
              <li key={i}>
                XML: {d.label} {d.xmlValue} — δεν υπάρχει στα επίσημα
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {detail.descriptionHadTable && (
        <p className="text-[length:var(--fs-12)] text-k-text-3">
          Η περιγραφή του XML είχε πίνακα που δεν μεταφέρθηκε· δείτε την «Περιγραφή XML» παρακάτω.
        </p>
      )}

      <Tabs defaultValue="el">
        <TabsList className="w-full">
          {LANGS.map((l) => (
            <TabsTrigger key={l.key} value={l.key}>
              {l.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {LANGS.map((l) => (
          <TabsContent key={l.key} value={l.key} className="space-y-3">
            <LangEditor
              lang={l.key}
              value={value[l.key]}
              disabled={!canEdit}
              onChange={(c) => onChange({ ...value, [l.key]: c })}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function LangEditor({
  lang,
  value,
  onChange,
  disabled,
}: {
  lang: Lang;
  value: XmlContent;
  onChange: (c: XmlContent) => void;
  disabled: boolean;
}) {
  // Το textarea κρατά και κενές γραμμές όσο γράφει ο χρήστης· τις καθαρίζει το HDCtool.
  const [text, setText] = useState(value.features.join("\n"));
  const specs = value.specs;
  const setSpecs = (next: typeof specs) => onChange({ ...value, specs: next });
  const move = (i: number, d: -1 | 1) => {
    const next = [...specs];
    const [row] = next.splice(i, 1);
    next.splice(i + d, 0, row!);
    setSpecs(next);
  };

  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`features-${lang}`} className="text-[length:var(--fs-12)] text-k-text-3">
          Χαρακτηριστικά (ένα ανά γραμμή, έως {MAX_FEATURES})
        </Label>
        <Textarea
          id={`features-${lang}`}
          rows={6}
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            onChange({ ...value, features: e.target.value.split("\n") });
          }}
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-[length:var(--fs-12)] font-medium text-k-ink">
          Τεχνικά χαρακτηριστικά ({specs.length}/{MAX_SPECS})
        </p>
        {specs.map((row, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 sm:flex sm:items-center">
            <Input
              aria-label={`Ετικέτα ${i + 1}`}
              value={row.label}
              disabled={disabled}
              onChange={(e) => setSpecs(specs.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
              className="h-9 sm:flex-1"
            />
            <Input
              aria-label={`Τιμή ${i + 1}`}
              value={row.value}
              disabled={disabled}
              onChange={(e) => setSpecs(specs.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
              className="h-9 sm:flex-1"
            />
            {!disabled && (
              <div className="col-span-2 flex justify-end gap-0.5 sm:col-span-1">
                <Button type="button" size="icon" variant="ghost" className="size-9" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-3.5" aria-hidden />
                  <span className="sr-only">Πάνω</span>
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9"
                  disabled={i === specs.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="size-3.5" aria-hidden />
                  <span className="sr-only">Κάτω</span>
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9"
                  onClick={() => setSpecs(specs.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  <span className="sr-only">Αφαίρεση</span>
                </Button>
              </div>
            )}
          </div>
        ))}
        {!disabled && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={specs.length >= MAX_SPECS}
            onClick={() => setSpecs([...specs, { label: "", value: "" }])}
          >
            <Plus className="size-4" aria-hidden />
            Προσθήκη γραμμής
          </Button>
        )}
      </div>
    </>
  );
}

const isEmpty = (c: XmlItemDetail["contentEl"]) => !c || (c.features.length === 0 && c.specs.length === 0);

/**
 * «Περιγραφή XML»: η περιγραφή και η σύντομη περιγραφή του XML, καθαρισμένες.
 * Ανοιχτή όταν το item δεν έχει ακόμα περιεχόμενο, για να φαίνεται η πηγή.
 */
export function XmlDescription({ detail }: { detail: XmlItemDetail }) {
  const hasText = !!detail.descriptionText || !!detail.shortDescriptionText;
  return (
    <details open={isEmpty(detail.contentEl)} className="group" aria-label="Περιγραφή XML">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-[length:var(--fs-13)] font-semibold text-k-ink">
        <ChevronDown className="size-4 -rotate-90 transition-transform group-open:rotate-0" aria-hidden />
        Περιγραφή XML
        {!hasText && <span className="font-normal text-k-text-3"> · κενή</span>}
      </summary>
      <div className="mt-2 space-y-3">
        <DescriptionBlock title="Περιγραφή (Description)" text={detail.descriptionText} />
        <DescriptionBlock title="Σύντομη περιγραφή (ShortDescription)" text={detail.shortDescriptionText} />
      </div>
    </details>
  );
}

function DescriptionBlock({ title, text }: { title: string; text: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-[length:var(--fs-12)] font-medium text-k-text-3">{title}</p>
      {text ? (
        <pre className="max-h-80 overflow-y-auto border border-k-line bg-k-surface-3 p-2 font-sans text-[length:var(--fs-12)] break-words whitespace-pre-wrap">
          {text}
        </pre>
      ) : (
        <p className="text-[length:var(--fs-12)] text-k-text-3">—</p>
      )}
    </div>
  );
}
