"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { saveMessages } from "./actions";
import type { EditableIntlPage } from "@/lib/content/messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

/**
 * The editor for the storefront's next-intl copy — page titles, leads and the
 * shared labels that render through `t("…")`.
 *
 * One accordion per page. Each field is plain text, not rich HTML: these
 * strings are printed inside fixed markup (`<h1>`, `<p>`), so an HTML editor
 * would double-wrap or escape. A field whose catalogue text carries a `{var}`
 * placeholder shows which variables it must keep — removing one is allowed
 * (the number stops showing), inventing one is rejected on save.
 *
 * Same honesty as the copy editor beside it: a field set back to its original
 * text, or emptied, deletes its override on save rather than storing a lookalike
 * row.
 */

const LOCALE_LABEL: Record<string, string> = { el: "Ελληνικά", en: "English", it: "Italiano" };

/** The ICU argument names a string refers to — mirrors the server guard. */
function argNames(value: string): string[] {
  const out = new Set<string>();
  const re = /\{\s*(\w+)\s*(?:,|\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) out.add(m[1]!);
  return [...out];
}

export function MessagePagesEditor({
  locale,
  pages,
}: {
  locale: string;
  pages: EditableIntlPage[];
}) {
  const baseline = useMemo(() => {
    const out: Record<string, string> = {};
    for (const page of pages) for (const f of page.fields) out[f.path] = f.value;
    return out;
  }, [pages]);
  const original = useMemo(() => {
    const out: Record<string, string> = {};
    for (const page of pages) for (const f of page.fields) out[f.path] = f.base;
    return out;
  }, [pages]);

  const [draft, setDraft] = useState<Record<string, string>>(baseline);
  const [pending, start] = useTransition();

  const dirty = useMemo(
    () => Object.keys(draft).filter((k) => draft[k] !== baseline[k]),
    [draft, baseline],
  );

  function submit() {
    const data = new FormData();
    for (const key of dirty) data.set(key, draft[key]);
    start(async () => {
      const result = await saveMessages(locale, data);
      if (result.saved > 0) toast.success(`Αποθηκεύτηκαν ${result.saved} κείμενα.`);
      result.errors.forEach((e) => toast.error(e));
    });
  }

  return (
    <div className="pb-28">
      <div className="space-y-3">
        {pages.map((page) => {
          const pageDirty = page.fields.filter((f) => draft[f.path] !== baseline[f.path]).length;
          return (
            <details key={page.id} className="group border border-k-line bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-3 border-b border-transparent bg-k-surface-3 px-4 py-3 group-open:border-k-line">
                <ChevronDown
                  className="size-4 shrink-0 text-k-text-3 transition-transform group-open:rotate-180"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold tracking-tight text-k-ink">
                    {page.title}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-k-text-3">{page.blurb}</span>
                </span>
                {pageDirty > 0 && (
                  <Badge className="shrink-0 bg-k-ink text-white">{pageDirty}</Badge>
                )}
              </summary>

              <div className="divide-y divide-k-line px-4">
                {page.fields.map((f) => {
                  const id = `m-${f.path.replace(/\./g, "-")}`;
                  const value = draft[f.path] ?? "";
                  const orig = original[f.path] ?? "";
                  const changed = value !== baseline[f.path];
                  const isOriginal = value.trim() === orig.trim();
                  const args = argNames(orig);
                  const long = orig.length > 60 || orig.includes("\n");
                  const key = f.path.slice("content.".length);

                  return (
                    <div
                      key={f.path}
                      className="grid gap-2 py-5 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-8"
                    >
                      <div className="min-w-0">
                        <Label htmlFor={id} className="font-mono text-[11.5px] text-k-text-3">
                          {key}
                        </Label>
                        {args.length > 0 && (
                          <p className="mt-1 text-[11px] leading-[1.5] text-k-text-3">
                            Κρατήστε τις μεταβλητές:{" "}
                            {args.map((a) => (
                              <code key={a} className="rounded bg-k-surface-3 px-1 text-k-ink">
                                {`{${a}}`}
                              </code>
                            ))}
                          </p>
                        )}
                      </div>

                      <div className="min-w-0">
                        {long ? (
                          <textarea
                            id={id}
                            rows={3}
                            value={value}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.path]: e.target.value }))}
                            className="w-full max-w-[40rem] border border-k-line-2 bg-white px-3 py-2 text-[13px] leading-[1.6] text-k-ink outline-none focus:border-k-ink"
                          />
                        ) : (
                          <Input
                            id={id}
                            value={value}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.path]: e.target.value }))}
                            className="max-w-[40rem] text-[13px]"
                          />
                        )}

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-k-text-3">
                          {changed && <Badge className="bg-k-ink text-white">αλλαγμένο</Badge>}
                          {isOriginal ? (
                            <span className="text-k-text-4">αρχικό κείμενο</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDraft((d) => ({ ...d, [f.path]: orig }))}
                              className="inline-flex items-center gap-1 text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline"
                            >
                              <RotateCcw className="size-3" aria-hidden />
                              επαναφορά αρχικού
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      {dirty.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-k-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[72rem] items-center justify-between gap-4 px-4 py-3 lg:px-8">
            <p className="text-[12.5px] text-k-text-2">
              {dirty.length === 1
                ? "1 μη αποθηκευμένη αλλαγή"
                : `${dirty.length} μη αποθηκευμένες αλλαγές`}{" "}
              <span className="text-k-text-4">· {LOCALE_LABEL[locale] ?? locale}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setDraft(baseline)} disabled={pending}>
                Αναίρεση
              </Button>
              <Button onClick={submit} disabled={pending}>
                {pending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Αποθήκευση
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
