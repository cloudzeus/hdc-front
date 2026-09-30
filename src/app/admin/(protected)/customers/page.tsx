import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { getCustomers } from "@/lib/admin/customers";
import { PageShell } from "@/components/admin/PageShell";

export const dynamic = "force-dynamic";

const dt = new Intl.DateTimeFormat("el-GR", {
  dateStyle: "short",
  timeZone: "Europe/Athens",
});

/**
 * Admin screen — customers.
 *
 * Οι ιδιώτες με λογαριασμό: μια λίστα για αναζήτηση, όχι ουρά. Το HDC πουλά
 * μόνο σε ιδιώτες (spec Δ2), οπότε η ουρά έγκρισης εταιρειών B2B δεν υπάρχει.
 */
export default async function CustomersPage() {
  const session = await auth();
  assertCan(session?.user.role, "customers");

  const data = await getCustomers();

  return (
    <PageShell
      title="Πελάτες"
      description={
        data.total === 0
          ? "Κανένας πελάτης με λογαριασμό ακόμη."
          : data.total > data.individuals.length
            ? `${data.total} ιδιώτες πελάτες · εμφανίζονται οι ${data.individuals.length} πιο πρόσφατοι`
            : `${data.total} ${data.total === 1 ? "ιδιώτης πελάτης" : "ιδιώτες πελάτες"}`
      }
    >
      <IndividualTable rows={data.individuals} />
    </PageShell>
  );
}

function IndividualTable({
  rows,
}: {
  rows: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: Date;
    orders: number;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <p className="border border-k-line bg-white px-4 py-14 text-center text-[13px] text-k-text-3">
        Κανένας ιδιώτης πελάτης ακόμη.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border border-k-line bg-white">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-k-line text-[10.5px] uppercase tracking-[0.06em] text-k-text-4">
            <th className="px-3 py-2 font-medium">Όνομα</th>
            <th className="px-3 py-2 font-medium">Επικοινωνία</th>
            <th className="px-3 py-2 text-right font-medium">Παραγγελίες</th>
            <th className="px-3 py-2 font-medium">Εγγραφή</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-k-line last:border-0">
              <td className="px-3 py-2.5 text-[12.5px] text-k-ink">{r.name || "—"}</td>
              <td className="px-3 py-2.5 text-[12.5px] text-k-text-2">
                <a href={`mailto:${r.email}`} className="underline-offset-2 hover:underline">
                  {r.email}
                </a>
                {r.phone && <span className="numeral block text-[11px] text-k-text-4">{r.phone}</span>}
              </td>
              <td className="numeral px-3 py-2.5 text-right text-[12.5px] text-k-ink">{r.orders}</td>
              <td className="numeral px-3 py-2.5 text-[11.5px] text-k-text-4">
                {dt.format(r.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
