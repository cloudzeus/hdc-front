import { ADMIN_LOCALE } from "@/lib/admin/locale";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert, ExternalLink, TriangleAlert } from "lucide-react";
import { auth } from "@/auth";
import { formatMoney } from "@/lib/format";
import { getDashboard } from "@/lib/admin/dashboard";
import { PageShell, Panel, Stat } from "@/components/admin/PageShell";
import { OrdersTable } from "@/components/admin/OrdersTable";

export const dynamic = "force-dynamic";

const dt = new Intl.DateTimeFormat("el-GR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Athens",
});

/**
 * Η ενότητα /admin/milwaukee έρχεται με το κομμάτι 2 του σχεδίου
 * (docs/superpowers/specs/2026-09-30-hdc-admin-design.md §4). Μέχρι να υπάρξει,
 * ο σύνδεσμος θα έβγαζε 404· γίνεται true μαζί με τη σελίδα.
 */
const MILWAUKEE_SECTION = false;

/** Οι γραμμές διαθεσιμότητας του πάνελ καταλόγου, με τα λόγια του eshop. */
const AVAILABILITY_ROWS = [
  { key: "stock", label: "Σε απόθεμα", dot: "bg-[var(--hdc-ok)]" },
  { key: "supplier", label: "Διαθέσιμο · 3–5 εργάσιμες", dot: "bg-[var(--hdc-wait)]" },
  { key: "order", label: "Παράδοση 1–3 εργάσιμες", dot: "bg-k-text-5" },
  { key: "xmlOnly", label: "Μόνο-XML", dot: "border border-k-text-4 bg-transparent" },
] as const;

/**
 * Admin home.
 *
 * Ordered by what an operator opens it to find out: is anything waiting for me,
 * then how the shop is doing, then the detail. A counter that is zero is not
 * shown — an "0 προβλήματα" panel reads as broken, its absence reads as calm.
 */
export default async function AdminDashboard() {
  const session = await auth();
  const data = await getDashboard();

  return (
    <PageShell
      title="Επισκόπηση"
      description={session?.user.email}
      actions={
        <Link
          href="/"
          target="_blank"
          className="inline-flex items-center gap-1.5 border border-k-line bg-white px-3 py-1.5 text-[12.5px] text-k-text-2 transition-colors hover:border-k-line-2 hover:text-k-ink"
        >
          Κατάστημα
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      }
    >
      <div className="space-y-4">
        {data.attention.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.attention.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`group flex h-full items-start gap-2.5 border border-l-[3px] border-k-line bg-white p-3.5 transition-colors hover:bg-k-surface-3 ${
                    item.tone === "urgent" ? "border-l-k-red" : "border-l-k-amber"
                  }`}
                >
                  {item.tone === "urgent" ? (
                    <CircleAlert className="mt-px size-4 shrink-0 text-k-red" aria-hidden />
                  ) : (
                    <TriangleAlert className="mt-px size-4 shrink-0 text-k-amber" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium leading-snug text-k-ink">
                      <span className="numeral">{item.count}</span> · {item.label}
                    </span>
                    <span className="mt-1 block text-[11px] leading-[1.45] text-k-text-3">
                      {item.detail}
                    </span>
                  </span>
                  <ArrowRight className="ml-auto mt-px size-3.5 shrink-0 text-k-text-5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 border border-k-line bg-white px-4 py-3 text-[12.5px] text-k-text-2">
            <Check className="size-4 text-k-green" aria-hidden />
            Τίποτα δεν περιμένει ενέργεια.
          </p>
        )}

        <div className="grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Παραγγελίες · 7 ημέρες" value={String(data.orders.last7)} />
          <Stat
            label="Τζίρος · 7 ημέρες"
            value={formatMoney(data.orders.revenue7, ADMIN_LOCALE)}
            hint="μόνο πληρωμένες"
          />
          <Stat label="Παραγγελίες · 30 ημέρες" value={String(data.orders.last30)} />
          <Stat
            label="Τζίρος · 30 ημέρες"
            value={formatMoney(data.orders.revenue30, ADMIN_LOCALE)}
            hint="μόνο πληρωμένες"
          />
        </div>

        <div className="space-y-4">
          <Panel
            title="Πρόσφατες παραγγελίες"
            bodyClassName=""
            actions={
              <Link
                href="/admin/orders"
                className="text-[12px] text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline"
              >
                Όλες
              </Link>
            }
          >
            <OrdersTable orders={data.recent} />
          </Panel>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Κατάλογος" bodyClassName="">
              <dl className="divide-y divide-k-line text-[12.5px]">
                <div className="flex items-baseline justify-between px-4 py-2.5">
                  <dt className="text-k-text-2">Προϊόντα</dt>
                  <dd className="numeral text-k-ink">{data.catalogue.products}</dd>
                </div>
                <div className="flex items-baseline justify-between px-4 py-2.5">
                  <dt className="text-k-text-2">Ενεργά</dt>
                  <dd className="numeral text-k-ink">{data.catalogue.active}</dd>
                </div>
              </dl>
              {/* Ενεργά ανά διαθεσιμότητα, με τον κανόνα του eshop: απόθεμα, μετά
                  προμηθευτής, μετά παραγγελία. Τα τρία πρώτα αθροίζουν στα ενεργά. */}
              <dl className="divide-y divide-k-line border-t border-k-line text-[length:var(--fs-12-5)]">
                {AVAILABILITY_ROWS.map((row) => (
                  <div key={row.key} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                    <dt className="flex items-center gap-2 text-k-text-2">
                      <span className={`size-2 shrink-0 ${row.dot}`} aria-hidden />
                      {row.label}
                    </dt>
                    <dd className="numeral text-k-ink">{data.availability[row.key]}</dd>
                  </div>
                ))}
              </dl>
              {MILWAUKEE_SECTION && (
                <div className="border-t border-k-line px-4 py-2.5">
                  <Link
                    href="/admin/milwaukee"
                    className="inline-flex items-center gap-1 text-[length:var(--fs-12)] text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline"
                  >
                    Εργαλεία Milwaukee
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              )}
            </Panel>

            <Panel
              title="Συγχρονισμός"
              bodyClassName=""
              actions={
                <Link
                  href="/admin/sync"
                  className="text-[12px] text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline"
                >
                  Λεπτομέρειες
                </Link>
              }
            >
              {data.sync.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12.5px] text-k-text-3">
                  Δεν έχει τρέξει ακόμη.
                </p>
              ) : (
                <ul className="divide-y divide-k-line">
                  {data.sync.map((s) => (
                    <li key={s.channel} className="flex items-center gap-2 px-4 py-2.5">
                      {s.lastStatus === "SUCCESS" ? (
                        <Check className="size-3.5 shrink-0 text-k-green" aria-label="Επιτυχία" />
                      ) : s.lastStatus ? (
                        <TriangleAlert
                          className="size-3.5 shrink-0 text-k-amber"
                          aria-label={s.lastStatus}
                        />
                      ) : (
                        <span className="size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-k-text-2">
                        {s.channel}
                      </span>
                      <span className="numeral shrink-0 text-[10.5px] text-k-text-4">
                        {s.lastSuccessAt ? dt.format(s.lastSuccessAt) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
