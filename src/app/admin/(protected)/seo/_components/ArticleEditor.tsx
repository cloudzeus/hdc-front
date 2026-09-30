"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Eye, ImageUp, Save, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ArticleForm } from "@/lib/seo/admin-data";
import { ANSWER_WORDS, contentChecks, DESCRIPTION_MAX, TITLE_MAX, words } from "@/lib/seo/seo-checks";
import { cn } from "@/lib/utils";
import {
  checkLinksAction,
  previewMarkdownAction,
  saveArticleAction,
  setArticleStatusAction,
  uploadHeroAction,
} from "../actions";
import { ChecksList, FaqEditor, Field, inputClass, LinesField } from "./shared";

/**
 * The article / guide editor: every field of a ContentArticle, the Markdown
 * body with a preview as the storefront renders it, the FAQ, the hero image
 * (uploaded to our CDN), and live checks — title and description lengths,
 * the 40–60-word answer, forbidden wording, links to pages that do not exist.
 */
export function ArticleEditor({ initial, canEdit }: { initial: ArticleForm; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const [broken, setBroken] = useState<string[]>([]);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const set = <K extends keyof ArticleForm>(key: K, value: ArticleForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const checks = useMemo(() => contentChecks(form, { answerRequired: true }), [form]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const base = form.kind === "GUIDE" ? "/odigoi" : "/blog";
  const publicPath = `${base}/${form.slug}`;
  const disabled = !canEdit || pending;

  function save() {
    start(async () => {
      const result = await saveArticleAction(form);
      if (!result.ok) return void toast.error(result.error);
      setBroken(result.broken);
      toast.success("Αποθηκεύτηκε.");
      if (!form.id) router.replace(`/admin/seo?tab=articles&edit=${result.id}`);
      else router.refresh();
    });
  }

  function publish(on: boolean) {
    if (!form.id) return;
    start(async () => {
      const result = await setArticleStatusAction(form.id!, on);
      if (!result.ok) return void toast.error(result.error);
      toast.success(on ? "Δημοσιεύτηκε." : "Έγινε πρόχειρο.");
      set("status", on ? "PUBLISHED" : "DRAFT");
      router.refresh();
    });
  }

  function showPreview() {
    start(async () => {
      const [html, links] = await Promise.all([previewMarkdownAction(form.body), checkLinksAction(form.body)]);
      setPreview(html);
      setBroken(links);
    });
  }

  function upload(file: File) {
    const data = new FormData();
    data.set("file", file);
    data.set("slug", form.slug);
    start(async () => {
      const result = await uploadHeroAction(data);
      if (!result.ok) return void toast.error(result.error);
      set("heroImageUrl", result.url);
      setUploadInfo(result.info);
      toast.success("Η εικόνα ανέβηκε. Αποθηκεύστε για να μείνει.");
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 gap-4">
        <section className="grid gap-4 border border-k-line bg-white p-4">
          <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <Field id="kind" label="Είδος">
              <select
                id="kind"
                value={form.kind}
                disabled={disabled || !!form.id}
                onChange={(e) => set("kind", e.target.value as ArticleForm["kind"])}
                className="h-9 border border-k-line bg-white px-2 text-[length:var(--fs-13)]"
              >
                <option value="ARTICLE">Άρθρο (blog)</option>
                <option value="GUIDE">Οδηγός αγοράς</option>
              </select>
            </Field>
            <Field id="slug" label="Διεύθυνση (slug)" hint={<code className="font-mono">{publicPath}</code>}>
              <Input id="slug" value={form.slug} disabled={disabled} onChange={(e) => set("slug", e.target.value)} className={cn(inputClass, "font-mono")} />
            </Field>
          </div>
          <Field id="title" label="Τίτλος (H1)">
            <Input id="title" value={form.title} disabled={disabled} onChange={(e) => set("title", e.target.value)} className={inputClass} />
          </Field>
          <Field id="seoTitle" label="Τίτλος για τη Google" count={{ value: (form.seoTitle || form.title).length, max: TITLE_MAX }} hint="Κενό = ο τίτλος.">
            <Input id="seoTitle" value={form.seoTitle} placeholder={form.title} disabled={disabled} onChange={(e) => set("seoTitle", e.target.value)} className={inputClass} />
          </Field>
          <Field id="metaDescription" label="Περιγραφή για τη Google" count={{ value: form.metaDescription.length, max: DESCRIPTION_MAX }}>
            <Textarea id="metaDescription" value={form.metaDescription} disabled={disabled} onChange={(e) => set("metaDescription", e.target.value)} className={inputClass} />
          </Field>
          <Field
            id="answer"
            label="Σύντομη απάντηση"
            count={{ value: words(form.answer), min: ANSWER_WORDS.min, max: ANSWER_WORDS.max, unit: "λέξεις" }}
            hint="Απαντά μόνη της στην ερώτηση του τίτλου: αυτή παραθέτουν η Google και τα AI."
          >
            <Textarea id="answer" value={form.answer} disabled={disabled} onChange={(e) => set("answer", e.target.value)} className={inputClass} />
          </Field>
          <Field id="body" label="Κείμενο (Markdown)" hint="## για ενότητες, - για λίστες, [κείμενο](/katalogos/…) για συνδέσμους, ![περιγραφή](https://…) για εικόνες του CDN.">
            <Textarea id="body" value={form.body} disabled={disabled} onChange={(e) => set("body", e.target.value)} className={cn(inputClass, "min-h-80 font-mono")} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={showPreview} disabled={pending}>
              <Eye aria-hidden />
              Προεπισκόπηση
            </Button>
          </div>
          {preview != null && (
            <div className="border border-k-line bg-white p-4" aria-label="Προεπισκόπηση κειμένου">
              {form.answer && (
                <div className="hdc-answer" lang="el">
                  <b>Σύντομη απάντηση</b>
                  <p>{form.answer}</p>
                </div>
              )}
              <div className="hdc-prose" lang="el" dangerouslySetInnerHTML={{ __html: preview }} />
            </div>
          )}
        </section>

        <section className="grid gap-3 border border-k-line bg-white p-4">
          <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Συχνές ερωτήσεις</h2>
          <FaqEditor value={form.faq} onChange={(faq) => set("faq", faq)} disabled={disabled} />
        </section>

        <section className="grid gap-4 border border-k-line bg-white p-4 sm:grid-cols-3">
          <LinesField id="keywords" label="Λέξεις-κλειδιά" hint="Μία ανά γραμμή· δεν εμφανίζονται." value={form.keywords} onChange={(v) => set("keywords", v)} disabled={disabled} />
          <LinesField id="entities" label="Οντότητες" hint="Για το JSON-LD (about)." value={form.entities} onChange={(v) => set("entities", v)} disabled={disabled} />
          <LinesField id="sources" label="Πηγές" hint="Οι επίσημες σελίδες των στοιχείων." value={form.sources} onChange={(v) => set("sources", v)} disabled={disabled} />
        </section>
      </div>

      <aside className="grid content-start gap-4">
        <section className="grid gap-3 border border-k-line bg-white p-4">
          <p className="text-[length:var(--fs-12)] text-k-text-3">
            Κατάσταση:{" "}
            <b className={form.status === "PUBLISHED" ? "text-[var(--hdc-ok)]" : "text-[var(--hdc-wait)]"}>
              {form.status === "PUBLISHED" ? "Δημοσιευμένο" : "Πρόχειρο"}
            </b>
            {initial.updatedBy && (
              <>
                <br />
                Τελευταία αλλαγή: {initial.updatedBy}
              </>
            )}
          </p>
          <Button type="button" onClick={save} disabled={disabled || !dirty}>
            <Save aria-hidden />
            Αποθήκευση
          </Button>
          {form.id &&
            (form.status === "PUBLISHED" ? (
              <Button type="button" variant="outline" onClick={() => publish(false)} disabled={disabled || dirty}>
                <Undo2 aria-hidden />
                Απόσυρση (πρόχειρο)
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => publish(true)} disabled={disabled || dirty}>
                <Send aria-hidden />
                Δημοσίευση
              </Button>
            ))}
          {dirty && form.id && <p className="text-[length:var(--fs-11)] text-k-text-3">Αποθηκεύστε πρώτα για να αλλάξετε την κατάσταση.</p>}
          {form.id && (
            <Link
              href={`${publicPath}${form.status === "PUBLISHED" ? "" : "?preview=1"}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-[length:var(--fs-12)] text-k-red hover:underline"
            >
              Άνοιγμα στο κατάστημα <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          )}
        </section>

        <section className="grid gap-2 border border-k-line bg-white p-4">
          <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Έλεγχοι</h2>
          <ChecksList checks={checks} broken={broken} />
        </section>

        <section className="grid gap-3 border border-k-line bg-white p-4">
          <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Κεντρική εικόνα</h2>
          <div className="relative aspect-video w-full overflow-hidden bg-k-surface-3">
            {form.heroImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- CDN preview in the admin
              <img src={form.heroImageUrl} alt={form.heroImageAlt} className="absolute inset-0 size-full object-cover" />
            ) : (
              <span className="absolute inset-0 grid place-items-center text-[length:var(--fs-12)] text-k-text-4">Χωρίς εικόνα</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => fileRef.current?.click()}>
            <ImageUp aria-hidden />
            Ανέβασμα εικόνας
          </Button>
          {uploadInfo && <p className="text-[length:var(--fs-11)] text-k-text-3">{uploadInfo}</p>}
          <Field id="heroImageUrl" label="Διεύθυνση εικόνας">
            <Input id="heroImageUrl" value={form.heroImageUrl} disabled={disabled} onChange={(e) => set("heroImageUrl", e.target.value)} className={cn(inputClass, "font-mono")} />
          </Field>
          <Field id="heroImageAlt" label="Τι δείχνει (alt)">
            <Input id="heroImageAlt" value={form.heroImageAlt} placeholder={form.title} disabled={disabled} onChange={(e) => set("heroImageAlt", e.target.value)} className={inputClass} />
          </Field>
        </section>
      </aside>
    </div>
  );
}
