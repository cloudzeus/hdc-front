"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Save, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { JsonLdBlock } from "@/lib/seo/seo-checks";
import { checkJsonLdAction, previewLlmsAction, saveLlmsSummaryAction } from "../actions";
import { Field, inputClass } from "./shared";

/**
 * GEO: the Greek summary at the top of /llms.txt, with the whole file as the
 * models will read it; and a JSON-LD check of any page of the store.
 */
export function AiPanel({ summary, fallback, canEdit }: { summary: string; fallback: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(summary);
  const [preview, setPreview] = useState<string | null>(null);
  const [path, setPath] = useState("/");
  const [check, setCheck] = useState<{ url: string; status: number; blocks: JsonLdBlock[] } | null>(null);

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 border border-k-line bg-white p-4">
        <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Σύνοψη του llms.txt</h2>
        <Field id="llms-summary" label="Σύνοψη (ελληνικά)" hint="Κενό = η αυτόματη σύνοψη. Διατύπωση αντιπροσώπου απορρίπτεται και ισχύει η αυτόματη." count={{ value: text.length, max: 600 }}>
          <Textarea
            id="llms-summary"
            value={text}
            placeholder={fallback}
            disabled={!canEdit || pending}
            onChange={(e) => setText(e.target.value)}
            className={`${inputClass} min-h-28`}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button
              type="button"
              disabled={pending || text === summary}
              onClick={() =>
                start(async () => {
                  const r = await saveLlmsSummaryAction(text);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success("Αποθηκεύτηκε· το /llms.txt την έχει ήδη.");
                  router.refresh();
                })
              }
            >
              <Save aria-hidden />
              Αποθήκευση
            </Button>
          )}
          <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => setPreview(await previewLlmsAction(text)))}>
            <Eye aria-hidden />
            Προεπισκόπηση llms.txt
          </Button>
        </div>
        {preview && (
          <pre className="max-h-[28rem] overflow-auto border border-k-line bg-k-surface-2 p-3 font-mono text-[length:var(--fs-12)] leading-[1.5] whitespace-pre-wrap text-k-ink">
            {preview}
          </pre>
        )}
      </section>

      <section className="grid gap-3 border border-k-line bg-white p-4">
        <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Έλεγχος JSON-LD</h2>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await checkJsonLdAction(path);
              if (!r.ok) return void toast.error(r.error);
              setCheck(r);
            });
          }}
        >
          <Input aria-label="Διαδρομή σελίδας" value={path} onChange={(e) => setPath(e.target.value)} className={`${inputClass} max-w-md font-mono`} />
          <Button type="submit" variant="outline" disabled={pending}>
            <ScanSearch aria-hidden />
            Έλεγχος
          </Button>
        </form>
        {check && (
          <div className="grid gap-2">
            <p className="font-mono text-[length:var(--fs-12)] break-all text-k-text-3">
              {check.status} · {check.url} · {check.blocks.length} blocks
            </p>
            {check.blocks.map((b, i) => (
              <details key={i} className="border border-k-line">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-[length:var(--fs-12)]">
                  <b className="text-k-ink">{b.types.join(" + ") || "—"}</b>
                  {b.issues.length === 0 ? (
                    <span className="text-[var(--hdc-ok)]">σωστό</span>
                  ) : (
                    <span className="text-k-red">{b.issues.length} προβλήματα</span>
                  )}
                </summary>
                {b.issues.length > 0 && (
                  <ul className="list-disc px-8 pb-2 text-[length:var(--fs-12)] text-k-red">
                    {b.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
                <pre className="max-h-72 overflow-auto border-t border-k-line bg-k-surface-2 p-3 font-mono text-[length:var(--fs-11)] whitespace-pre-wrap break-all">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(b.raw), null, 2);
                    } catch {
                      return b.raw;
                    }
                  })()}
                </pre>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
