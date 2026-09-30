"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Send } from "lucide-react";
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
import type { ArticleRow } from "@/lib/seo/admin-data";
import { cn } from "@/lib/utils";
import { publishAllAction, setArticleStatusAction } from "../actions";

const KIND_LABEL = { ARTICLE: "Άρθρο", GUIDE: "Οδηγός" } as const;

/**
 * The articles and guides: filters (kind, status, search) as a GET form, a
 * row per article with its state and a publish switch, and «Δημοσίευση όλων»
 * behind a confirmation. A table on wide screens, cards below 1024px — never
 * a sideways scroll.
 */
export function ArticlesList({
  rows,
  filter,
  canEdit,
}: {
  rows: ArticleRow[];
  filter: { kind: string; status: string; q: string };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const drafts = rows.filter((r) => r.status === "DRAFT").length;
  const kind = filter.kind === "ARTICLE" || filter.kind === "GUIDE" ? filter.kind : null;

  const toggle = (row: ArticleRow) =>
    start(async () => {
      const result = await setArticleStatusAction(row.id, row.status !== "PUBLISHED");
      if (!result.ok) return void toast.error(result.error);
      toast.success(row.status === "PUBLISHED" ? `«${row.title}»: πρόχειρο.` : `«${row.title}»: δημοσιεύτηκε.`);
      router.refresh();
    });

  const publishAll = () =>
    start(async () => {
      const result = await publishAllAction(kind);
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Δημοσιεύτηκαν ${result.published}.`);
      if (result.refused.length) toast.error(`Δεν δημοσιεύτηκαν (λόγω διατύπωσης): ${result.refused.join(", ")}`);
      router.refresh();
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-2" action="/admin/seo" method="get">
          <input type="hidden" name="tab" value="articles" />
          <label className="grid gap-1 text-[length:var(--fs-12)] text-k-text-3">
            Είδος
            <select name="kind" defaultValue={filter.kind} className="h-9 border border-k-line bg-white px-2 text-[length:var(--fs-13)] text-k-ink">
              <option value="">Όλα</option>
              <option value="ARTICLE">Άρθρα</option>
              <option value="GUIDE">Οδηγοί</option>
            </select>
          </label>
          <label className="grid gap-1 text-[length:var(--fs-12)] text-k-text-3">
            Κατάσταση
            <select name="status" defaultValue={filter.status} className="h-9 border border-k-line bg-white px-2 text-[length:var(--fs-13)] text-k-ink">
              <option value="">Όλες</option>
              <option value="DRAFT">Πρόχειρα</option>
              <option value="PUBLISHED">Δημοσιευμένα</option>
            </select>
          </label>
          <label className="grid gap-1 text-[length:var(--fs-12)] text-k-text-3">
            Αναζήτηση
            <input
              name="q"
              defaultValue={filter.q}
              placeholder="Τίτλος ή slug"
              className="h-9 w-56 border border-k-line bg-white px-2 text-[length:var(--fs-13)] text-k-ink"
            />
          </label>
          <Button type="submit" variant="outline">
            Φίλτρο
          </Button>
        </form>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/seo?tab=articles&edit=new&kind=ARTICLE">
                <Plus aria-hidden />
                Άρθρο
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/seo?tab=articles&edit=new&kind=GUIDE">
                <Plus aria-hidden />
                Οδηγός
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" disabled={pending || drafts === 0}>
                  <Send aria-hidden />
                  Δημοσίευση όλων ({drafts})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Δημοσίευση όλων των προχείρων;</AlertDialogTitle>
                  <AlertDialogDescription>
                    Θα δημοσιευτούν {drafts} {kind === "GUIDE" ? "οδηγοί" : kind === "ARTICLE" ? "άρθρα" : "άρθρα και οδηγοί"} και θα
                    φανούν αμέσως στο κατάστημα, στο sitemap και στο llms.txt. Όσα γράφουν «αντιπρόσωπος» ή παρόμοιο μένουν
                    πρόχειρα. Κάθε ένα αποσύρεται αργότερα από τη λίστα.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Άκυρο</AlertDialogCancel>
                  <AlertDialogAction onClick={publishAll}>Δημοσίευση</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <p className="numeral text-[length:var(--fs-12)] text-k-text-3">
        {rows.length} εγγραφές · {rows.length - drafts} δημοσιευμένες · {drafts} πρόχειρες
      </p>

      {/* Wide screens: a table. */}
      <table className="hidden w-full border border-k-line bg-white text-[length:var(--fs-13)] lg:table">
        <thead className="bg-k-surface-3 text-left text-[length:var(--fs-11)] uppercase tracking-[0.06em] text-k-text-3">
          <tr>
            <th className="px-3 py-2 font-medium">Τίτλος</th>
            <th className="px-3 py-2 font-medium">Είδος</th>
            <th className="px-3 py-2 font-medium">Κατάσταση</th>
            <th className="px-3 py-2 font-medium">Αλλαγή</th>
            <th className="px-3 py-2 font-medium">
              <span className="sr-only">Ενέργειες</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-k-line align-top">
              <td className="px-3 py-2.5">
                <Link href={`/admin/seo?tab=articles&edit=${row.id}`} className="font-medium text-k-ink hover:text-k-red">
                  {row.title}
                </Link>
                <p className="font-mono text-[length:var(--fs-11)] text-k-text-4">{row.slug}</p>
                {!row.hasFaq && <p className="text-[length:var(--fs-11)] text-[var(--hdc-wait)]">Χωρίς FAQ</p>}
              </td>
              <td className="px-3 py-2.5 text-k-text-2">{KIND_LABEL[row.kind]}</td>
              <td className="px-3 py-2.5">
                <StatusTag status={row.status} />
              </td>
              <td className="px-3 py-2.5 text-[length:var(--fs-12)] text-k-text-3">
                {new Date(row.updatedAt).toLocaleDateString("el-GR")}
                <br />
                {row.updatedBy}
              </td>
              <td className="px-3 py-2.5 text-right">
                {canEdit && (
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => toggle(row)}>
                    {row.status === "PUBLISHED" ? "Απόσυρση" : "Δημοσίευση"}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Below 1024px: cards. */}
      <ul className="grid gap-2 lg:hidden">
        {rows.map((row) => (
          <li key={row.id} className="grid gap-2 border border-k-line bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/admin/seo?tab=articles&edit=${row.id}`} className="min-w-0 font-medium text-k-ink">
                {row.title}
              </Link>
              <StatusTag status={row.status} />
            </div>
            <p className="font-mono text-[length:var(--fs-11)] break-all text-k-text-4">
              {KIND_LABEL[row.kind]} · {row.slug}
            </p>
            {canEdit && (
              <Button type="button" size="sm" variant="outline" className="w-fit" disabled={pending} onClick={() => toggle(row)}>
                {row.status === "PUBLISHED" ? "Απόσυρση" : "Δημοσίευση"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusTag({ status }: { status: ArticleRow["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex border px-1.5 py-px text-[length:var(--fs-11)] font-medium whitespace-nowrap",
        status === "PUBLISHED"
          ? "border-transparent bg-[var(--hdc-ok)]/10 text-[var(--hdc-ok)]"
          : "border-transparent bg-[var(--hdc-wait)]/10 text-[var(--hdc-wait)]",
      )}
    >
      {status === "PUBLISHED" ? "Δημοσιευμένο" : "Πρόχειρο"}
    </span>
  );
}
