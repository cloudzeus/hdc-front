"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Eraser, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SeoTargetType } from "@/generated/prisma/enums";
import type { OverrideForm } from "@/lib/seo/admin-data";
import type { FaqPair } from "@/lib/seo/product-faq";
import { contentChecks, DESCRIPTION_MAX, type Check } from "@/lib/seo/seo-checks";
import { cn } from "@/lib/utils";
import { saveOverrideAction } from "../actions";
import { ChecksList, FaqEditor, Field, inputClass, SerpPreview } from "./shared";

export type AutoText = {
  h1: string;
  title: string;
  description: string;
  intro?: string | null;
  body?: string | null;
  faq?: FaqPair[];
};

type FieldName = "h1" | "seoTitle" | "metaDescription" | "intro" | "body" | "faq";

/**
 * Hand-written SEO copy for one page — category, hub, model or product —
 * over its automatic text. Every empty field shows the automatic text as its
 * placeholder, which is what the page uses while the field stays empty; the
 * Google result preview shows the words in force.
 */
export function OverrideEditor({
  targetType,
  targetKey,
  label,
  path,
  fields,
  auto,
  initial,
  canEdit,
  origin,
}: {
  targetType: SeoTargetType;
  targetKey: string;
  /** What is being edited, for the heading. */
  label: string;
  /** The page's Greek path. */
  path: string;
  fields: FieldName[];
  auto: AutoText;
  initial: OverrideForm;
  canEdit: boolean;
  origin: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [pending, start] = useTransition();
  const [serverChecks, setServerChecks] = useState<{ checks: Check[]; broken: string[] } | null>(null);
  const set = <K extends keyof OverrideForm>(key: K, value: OverrideForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const has = (f: FieldName) => fields.includes(f);
  const disabled = !canEdit || pending;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const title = form.seoTitle.trim() || auto.title;
  const description = form.metaDescription.trim() || auto.description;
  const checks = useMemo(
    () =>
      contentChecks({ title, seoTitle: title, metaDescription: description, body: `${form.intro}\n${form.body}`, faq: form.faq }).filter(
        (c) => c.field !== "title",
      ),
    [title, description, form],
  );

  function save(clear = false) {
    const payload = clear ? { h1: "", seoTitle: "", metaDescription: "", intro: "", body: "", faq: [] } : form;
    start(async () => {
      const result = await saveOverrideAction(targetType, targetKey, payload);
      if (!result.ok) return void toast.error(result.error);
      setServerChecks({ checks: result.checks, broken: result.broken });
      if (clear) setForm({ ...form, ...payload });
      toast.success(result.result === "cleared" ? "Ισχύει ξανά το αυτόματο κείμενο." : "Αποθηκεύτηκε.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="grid min-w-0 content-start gap-4 border border-k-line bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[length:var(--fs-15)] font-semibold text-k-ink">{label}</h2>
          <Link href={path} target="_blank" className="inline-flex items-center gap-1 text-[length:var(--fs-12)] text-k-red hover:underline">
            {path} <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </div>
        {has("h1") && (
          <Field id="ov-h1" label="Επικεφαλίδα (H1)">
            <Input id="ov-h1" value={form.h1} placeholder={auto.h1} disabled={disabled} onChange={(e) => set("h1", e.target.value)} className={inputClass} />
          </Field>
        )}
        {has("seoTitle") && (
          <Field id="ov-title" label="Τίτλος για τη Google" count={{ value: title.length, max: 65 }}>
            <Input id="ov-title" value={form.seoTitle} placeholder={auto.title} disabled={disabled} onChange={(e) => set("seoTitle", e.target.value)} className={inputClass} />
          </Field>
        )}
        {has("metaDescription") && (
          <Field id="ov-desc" label="Περιγραφή για τη Google" count={{ value: description.length, max: DESCRIPTION_MAX }}>
            <Textarea
              id="ov-desc"
              value={form.metaDescription}
              placeholder={auto.description}
              disabled={disabled}
              onChange={(e) => set("metaDescription", e.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        {has("intro") && (
          <Field id="ov-intro" label="Εισαγωγή" hint="Απαντά αμέσως: τι είναι, για ποιον, πώς διαλέγεις.">
            <Textarea
              id="ov-intro"
              value={form.intro}
              placeholder={auto.intro ?? "Χωρίς αυτόματη εισαγωγή"}
              disabled={disabled}
              onChange={(e) => set("intro", e.target.value)}
              className={cn(inputClass, "min-h-28")}
            />
          </Field>
        )}
        {has("body") && (
          <Field id="ov-body" label="Κείμενο (Markdown)" hint="Ενότητες ## με ερωτήσεις, μετά τα αυτόματα μπλοκ της σελίδας.">
            <Textarea
              id="ov-body"
              value={form.body}
              placeholder={auto.body ?? ""}
              disabled={disabled}
              onChange={(e) => set("body", e.target.value)}
              className={cn(inputClass, "min-h-60 font-mono")}
            />
          </Field>
        )}
        {has("faq") && (
          <div className="grid gap-2">
            <p className="text-[length:var(--fs-13)] font-medium text-k-ink">Συχνές ερωτήσεις</p>
            <FaqEditor value={form.faq} onChange={(faq) => set("faq", faq)} placeholder={auto.faq} disabled={disabled} />
          </div>
        )}
      </section>

      <aside className="grid content-start gap-4">
        <section className="grid gap-3 border border-k-line bg-white p-4">
          <Button type="button" onClick={() => save(false)} disabled={disabled || !dirty}>
            <Save aria-hidden />
            Αποθήκευση
          </Button>
          <Button type="button" variant="outline" onClick={() => save(true)} disabled={disabled}>
            <Eraser aria-hidden />
            Επαναφορά στο αυτόματο
          </Button>
          {initial.updatedBy && <p className="text-[length:var(--fs-11)] text-k-text-3">Τελευταία αλλαγή: {initial.updatedBy}</p>}
        </section>
        <section className="grid gap-2 border border-k-line bg-white p-4">
          <h3 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Αποτέλεσμα Google</h3>
          <SerpPreview title={title} url={`${origin}${path}`} description={description} />
        </section>
        <section className="grid gap-2 border border-k-line bg-white p-4">
          <h3 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Έλεγχοι</h3>
          <ChecksList checks={serverChecks && !dirty ? serverChecks.checks : checks} broken={serverChecks?.broken ?? []} />
        </section>
      </aside>
    </div>
  );
}
