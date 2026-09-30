import Link from "next/link";
import { auth } from "@/auth";
import { assertCan, can } from "@/lib/rbac";
import * as hdc from "@/lib/hdctool/milwaukee-admin";
import { PageShell } from "@/components/admin/PageShell";
import { cn } from "@/lib/utils";
import { LoadError } from "./_components/kit";
import { OverviewTab } from "./_components/OverviewTab";
import { AvailabilityTab } from "./_components/AvailabilityTab";
import { XmlItemsTab } from "./_components/XmlItemsTab";
import { SpecLabelsTab } from "./_components/SpecLabelsTab";
import { OfficialTab } from "./_components/OfficialTab";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "overview", label: "Επισκόπηση" },
  { id: "availability", label: "Διαθεσιμότητα" },
  { id: "xml", label: "Μόνο στο XML" },
  { id: "labels", label: "Ετικέτες τεχνικών" },
  { id: "official", label: "Επίσημο site" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Εργαλεία Milwaukee: η δουλειά της σελίδας «Milwaukee XML» του HDCtool μέσα
 * στο διαχειριστικό του HDC. Τα δεδομένα μένουν στο HDCtool· κάθε καρτέλα τα
 * ζητά από το `/api/hdc-admin/milwaukee/*` με το κλειδί `HDC_ADMIN_API_KEY`
 * και actor τον συνδεδεμένο χρήστη.
 *
 * Η καρτέλα κρατιέται στο URL (`?tab=`), ώστε ένας σύνδεσμος να ανοίγει
 * εκεί που πρέπει και η ανανέωση να μη γυρίζει στην αρχή.
 */
export default async function MilwaukeePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  assertCan(session?.user.role, "milwaukee.view");
  const actor = session.user.email ?? "";
  const canEdit = can(session.user.role, "milwaukee.edit");
  const canErp = can(session.user.role, "milwaukee.erp");

  const params = await searchParams;
  // `?tab=a&tab=b` δίνει πίνακα: μόνο ένα απλό string μετράει.
  const tab: TabId = TABS.find((t) => t.id === params.tab)?.id ?? "overview";
  const code = typeof params.code === "string" ? params.code : undefined;

  return (
    <PageShell
      title="Εργαλεία Milwaukee"
      description="Προϊόντα μόνο στο XML του Παπαθεοδοσίου, τιμές, κατηγορίες SoftOne, ανάλυση, επίσημο site και καταχώριση στο SoftOne — από το HDCtool."
    >
      <nav aria-label="Καρτέλες Milwaukee" className="mb-4 flex flex-wrap gap-px border border-k-line bg-k-line">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/milwaukee?tab=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 basis-[9rem] items-center justify-center px-3 text-center text-[length:var(--fs-12-5)] font-medium transition-colors",
              t.id === tab ? "bg-k-ink text-white" : "bg-white text-k-text-2 hover:bg-k-surface-3 hover:text-k-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <Overview actor={actor} canEdit={canEdit} />}
      {tab === "availability" && <Availability actor={actor} />}
      {tab === "xml" && <XmlItems actor={actor} canEdit={canEdit} canErp={canErp} />}
      {tab === "labels" && <Labels actor={actor} canEdit={canEdit} />}
      {tab === "official" && <Official actor={actor} code={code} canEdit={canEdit} />}
    </PageShell>
  );
}

async function Overview({ actor, canEdit }: { actor: string; canEdit: boolean }) {
  const r = await hdc.getOverview(actor);
  if (!r.ok) return <LoadError title="Η εικόνα προόδου δεν φόρτωσε." message={r.error} />;
  return <OverviewTab overview={r.overview} canEdit={canEdit} />;
}

async function Availability({ actor }: { actor: string }) {
  const r = await hdc.getAvailability(actor);
  if (!r.ok) return <LoadError title="Η διαθεσιμότητα δεν φόρτωσε." message={r.error} />;
  return <AvailabilityTab counts={r.counts} rows={r.rows} />;
}

async function XmlItems({ actor, canEdit, canErp }: { actor: string; canEdit: boolean; canErp: boolean }) {
  const [items, categories] = await Promise.all([hdc.getItems(actor), hdc.getSoftOneCategories(actor)]);
  if (!items.ok) return <LoadError title="Τα προϊόντα μόνο-XML δεν φόρτωσαν." message={items.error} />;
  return (
    <XmlItemsTab
      initialItems={items.items}
      categories={
        categories.ok ? { categories: categories.categories, groups: categories.groups, subgroups: categories.subgroups } : null
      }
      categoriesError={categories.ok ? null : categories.error}
      canEdit={canEdit}
      canErp={canErp}
    />
  );
}

async function Labels({ actor, canEdit }: { actor: string; canEdit: boolean }) {
  const r = await hdc.getSpecLabels(actor);
  if (!r.ok) return <LoadError title="Οι ετικέτες δεν φόρτωσαν." message={r.error} />;
  return <SpecLabelsTab labels={r.labels} canEdit={canEdit} />;
}

async function Official({ actor, code, canEdit }: { actor: string; code?: string; canEdit: boolean }) {
  const wanted = (code ?? "").trim().slice(0, 32);
  if (!wanted) return <OfficialTab code="" official={null} canEdit={canEdit} />;
  const r = await hdc.getOfficialByCode(actor, wanted);
  if (!r.ok) {
    return (
      <div className="space-y-4">
        <OfficialTab code={wanted} official={null} canEdit={canEdit} />
        <LoadError title="Τα επίσημα στοιχεία δεν φόρτωσαν." message={r.error} />
      </div>
    );
  }
  return <OfficialTab code={wanted} official={r.official} canEdit={canEdit} />;
}
