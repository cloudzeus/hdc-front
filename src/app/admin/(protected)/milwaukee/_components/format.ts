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

export type ReadKind = "overview" | "items" | "categories" | "item" | "peers" | "analysis" | "official" | "job";

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

// ---------------------------------------------------------------------------
// Εργασίες στο παρασκήνιο
// ---------------------------------------------------------------------------

/** Η απάντηση ενός action που ξεκίνησε εργασία (`JobStarted` στο actions.ts). */
export type JobStart = Result<{ jobId: string; reused: boolean }>;

type JobState = { status: "running" | "done" | "failed"; result: Result<object> | null; error: string | null };

/** Κωδικός της ακύρωσης από τον browser (κλείσιμο διαλόγου/πάνελ): χωρίς μήνυμα στον χρήστη. */
export const ABORTED_STATUS = -1;
export const isAborted = (r: { ok: boolean; status?: number }) => !r.ok && r.status === ABORTED_STATUS;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Ξεκινά μια μακριά ενέργεια (το action επιστρέφει αμέσως `jobId`) και ρωτά
 * την κατάστασή της κάθε 2,5″ ώσπου να τελειώσει. Το Cloudflare κόβει κάθε
 * αίτημα στα ~100″, οπότε κανένα αίτημα δεν περιμένει το HDCtool.
 *
 * Η ακύρωση (`signal`) σταματά μόνο το ρώτημα· η εργασία συνεχίζει στον server.
 */
export async function runJob<T extends object>(
  start: () => Promise<JobStart>,
  { signal, onReused, lostMessage, intervalMs = 2500, maxWaitMs = 8 * 60_000 }: {
    signal?: AbortSignal;
    onReused?: () => void;
    /** Μήνυμα όταν η εργασία χάθηκε (404: επανεκκίνηση ή deploy του hdc-front). */
    lostMessage?: string;
    intervalMs?: number;
    maxWaitMs?: number;
  } = {},
): Promise<Result<T>> {
  const aborted: Fail = { ok: false, status: ABORTED_STATUS, error: "Ακυρώθηκε" };
  const started = await attempt(start);
  if (!started.ok) return started;
  if (started.reused) onReused?.();
  const deadline = Date.now() + maxWaitMs;
  let misses = 0;
  let wait = Math.min(1000, intervalMs);
  for (;;) {
    await sleep(wait, signal);
    wait = intervalMs;
    if (signal?.aborted) return aborted;
    const r = await read<{ job: JobState }>("job", started.jobId);
    if (signal?.aborted) return aborted;
    if (r.ok) {
      misses = 0;
      if (r.job.status !== "running") {
        return (r.job.result ?? { ok: false, error: r.job.error ?? "Η εργασία απέτυχε" }) as Result<T>;
      }
    } else if (r.status === 404) {
      return lostMessage ? { ok: false, status: 404, error: lostMessage } : r;
    } else if (++misses >= 5) {
      return { ok: false, error: `Η κατάσταση της εργασίας δεν διαβάζεται: ${r.error}` };
    }
    if (Date.now() > deadline) {
      return { ok: false, error: "Η εργασία συνεχίζει στο HDCtool· ανανεώστε σε λίγο για το αποτέλεσμα" };
    }
  }
}
