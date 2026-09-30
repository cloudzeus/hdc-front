/** Μορφοποίηση και αναγνώσεις από τον browser για την ενότητα Milwaukee (el-GR). */

const EUR = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" });
const NUM = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" });

export const money = (v: number | null | undefined) => (v == null ? "—" : EUR.format(v));
export const num = (v: number | null | undefined) => (v == null ? "—" : NUM.format(v));
export const pct = (v: number | null | undefined) => (v == null ? "—" : `${NUM.format(v)}%`);
export const ratio = (v: number | null | undefined) =>
  v == null ? "—" : `×${v.toLocaleString("el-GR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
export const when = (iso: string | null | undefined) => (iso ? DATE.format(new Date(iso)) : "—");

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Αποτέλεσμα των αναγνώσεων και των ενεργειών (ίδιο σχήμα με τον client του HDCtool). */
export type Fail = { ok: false; error: string; status?: number; blockers?: string[]; mtrl?: number };
export type Result<T extends object = object> = ({ ok: true } & T) | Fail;

export type ReadKind = "overview" | "items" | "categories" | "item" | "peers" | "analysis" | "official";

/** Ανάγνωση μέσω `GET /admin/milwaukee/data`: ποτέ δεν πετάει. */
export async function read<T extends object>(r: ReadKind, id?: string): Promise<Result<T>> {
  const q = new URLSearchParams({ r, ...(id ? { id } : {}) });
  try {
    const res = await fetch(`/admin/milwaukee/data?${q}`, { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as Result<T> | null;
    if (data && typeof data === "object" && "ok" in data) return data;
    return { ok: false, status: res.status, error: `Η φόρτωση απέτυχε (HTTP ${res.status})` };
  } catch (e) {
    return { ok: false, status: 0, error: `Η φόρτωση απέτυχε: ${errorText(e)}` };
  }
}

/** Κλήση server action που μπορεί να πετάξει (λήξη σύνδεσης, δίκτυο) → πάντα Result. */
export async function attempt<T extends object>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}
