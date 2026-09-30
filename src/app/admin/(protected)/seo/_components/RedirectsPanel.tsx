"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addRedirectAction, removeRedirectAction, testRedirectAction } from "../actions";
import { inputClass } from "./shared";

export type RedirectRow = { id: string; fromPath: string; toPath: string; hits: number; lastHitAt: string | null; createdBy: string };

/**
 * Manual 301s: add (refused if it loops or points at a page that does not
 * exist), remove, and test where any address goes — a manual rule first, then
 * the Magento table, exactly as the proxy decides.
 */
export function RedirectsPanel({ rows, canEdit }: { rows: RedirectRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [probe, setProbe] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const add = () =>
    start(async () => {
      const r = await addRedirectAction(from, to);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Η ανακατεύθυνση ισχύει σε έως ένα λεπτό.");
      setFrom("");
      setTo("");
      router.refresh();
    });

  const remove = (id: string) =>
    start(async () => {
      const r = await removeRedirectAction(id);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Αφαιρέθηκε.");
      router.refresh();
    });

  const test = () =>
    start(async () => {
      const r = await testRedirectAction(probe);
      setResult(
        r.to
          ? `${r.status} → ${r.to} (${r.via === "manual" ? "χειροκίνητη" : "πίνακας Magento"})`
          : "Καμία ανακατεύθυνση: η διεύθυνση φτάνει στο κατάστημα όπως είναι.",
      );
    });

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 border border-k-line bg-white p-4">
        <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Δοκιμή διεύθυνσης</h2>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            test();
          }}
        >
          <Input
            aria-label="Διεύθυνση για δοκιμή"
            value={probe}
            onChange={(e) => setProbe(e.target.value)}
            placeholder="/mpataria-18v-5-0ah-m18-b5-4932430483"
            className={`${inputClass} max-w-md font-mono`}
          />
          <Button type="submit" variant="outline" disabled={pending || !probe.trim()}>
            <Search aria-hidden />
            Δοκιμή
          </Button>
        </form>
        {result && <p className="font-mono text-[length:var(--fs-12)] break-all text-k-ink">{result}</p>}
      </section>

      {canEdit && (
        <section className="grid gap-3 border border-k-line bg-white p-4">
          <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Νέα 301</h2>
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <Input aria-label="Από" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Από: /palia-selida" className={`${inputClass} font-mono`} />
            <Input aria-label="Προς" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Προς: /katalogos/…" className={`${inputClass} font-mono`} />
            <Button type="submit" disabled={pending || !from.trim() || !to.trim()}>
              <Plus aria-hidden />
              Προσθήκη
            </Button>
          </form>
        </section>
      )}

      <section className="border border-k-line bg-white">
        <h2 className="border-b border-k-line px-4 py-3 text-[length:var(--fs-13)] font-semibold text-k-ink">
          Χειροκίνητες 301 ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-[length:var(--fs-13)] text-k-text-3">Καμία ακόμη.</p>
        ) : (
          <ul className="divide-y divide-k-line">
            {rows.map((r) => (
              <li key={r.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0 font-mono text-[length:var(--fs-12)] break-all">
                  {r.fromPath} → <span className="text-k-red">{r.toPath}</span>
                  <p className="font-sans text-[length:var(--fs-11)] text-k-text-4">
                    {r.hits} χρήσεις{r.lastHitAt ? ` · τελευταία ${new Date(r.lastHitAt).toLocaleString("el-GR")}` : ""} · {r.createdBy}
                  </p>
                </div>
                {canEdit && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" size="sm" variant="outline" className="w-fit" disabled={pending}>
                        <Trash2 aria-hidden />
                        Αφαίρεση
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Αφαίρεση της ανακατεύθυνσης;</AlertDialogTitle>
                        <AlertDialogDescription>
                          Το {r.fromPath} δεν θα οδηγεί πια στο {r.toPath}. Οι browsers που έχουν ήδη ακολουθήσει τη 301 την
                          κρατούν αποθηκευμένη και θα συνεχίσουν να πηγαίνουν στον παλιό προορισμό, ώσπου να καθαριστεί η
                          μνήμη τους.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Άκυρο</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(r.id)}>Αφαίρεση</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
