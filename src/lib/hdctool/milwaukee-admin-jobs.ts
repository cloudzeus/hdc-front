import "server-only";
import { randomUUID } from "node:crypto";
import type { MilwaukeeResult } from "@/lib/hdctool/milwaukee-admin";

/**
 * Εργασίες στο παρασκήνιο για τις μακριές κλήσεις του HDCtool (καταχώριση στο
 * SoftOne, ενεργοποίηση, ανάλυση, μετάφραση, αναζήτηση στο επίσημο site).
 *
 * Το κατάστημα είναι πίσω από το Cloudflare, που κόβει κάθε αίτημα του
 * browser στα ~100″, ενώ αυτές οι κλήσεις κρατούν έως 300″. Άρα το server
 * action ξεκινά την κλήση χωρίς να την περιμένει, επιστρέφει `jobId` αμέσως,
 * και ο browser ρωτά την κατάσταση (`GET /admin/milwaukee/data?r=job`).
 *
 * Στη μνήμη της διεργασίας (globalThis, για να επιζεί του HMR): μια εργασία
 * ζει όσο η διεργασία, και αυτό αρκεί — το αποτέλεσμα γράφεται ούτως ή άλλως
 * στο HDCtool και στο audit log. Με πολλά containers ο browser πρέπει να
 * ρωτά το ίδιο· με ένα (σήμερα) δεν τίθεται θέμα.
 *
 * Επανεκκίνηση ή rolling deploy χάνει τις εργασίες που τρέχουν: η κλήση προς
 * το HDCtool κόβεται ή τελειώνει χωρίς να τη δει κανείς, και το ρώτημα του
 * browser παίρνει 404. Γι' αυτό η καταχώριση στο SoftOne γράφει γραμμή audit
 * και όταν ξεκινά, και ο browser ζητά νέα προεπισκόπηση πριν από νέα δοκιμή.
 */

export type JobKind = "erp-register" | "bulk-activate" | "analyze" | "translate" | "official-search";
export type JobStatus = "running" | "done" | "failed";

export type JobView = {
  id: string;
  kind: JobKind;
  itemId: string | null;
  actor: string;
  startedAt: string;
  finishedAt: string | null;
  status: JobStatus;
  /** Το αποτέλεσμα του client όπως ήρθε (και στην αποτυχία: `{ ok: false, error, ... }`). */
  result: MilwaukeeResult<object> | null;
  error: string | null;
};

/** Πόσο κρατιέται μια εργασία αφού τελειώσει (και το ανώτατο για μια «κολλημένη»). */
export const JOB_TTL_MS = 30 * 60 * 1000;
/** Ανώτατο πλήθος εργασιών στη μνήμη· πρώτα φεύγουν οι παλαιότερες που τελείωσαν. */
export const MAX_JOBS = 200;

type Job = Omit<JobView, "startedAt" | "finishedAt"> & {
  startedAt: number;
  finishedAt: number | null;
  /** Τι ακριβώς κάνει (π.χ. τα ids της ενεργοποίησης, ταξινομημένα)· `null` όταν αρκεί το item. */
  key: string | null;
};

const state = globalThis as unknown as { __hdcMilwaukeeJobs?: Map<string, Job> };

function jobs(): Map<string, Job> {
  state.__hdcMilwaukeeJobs ??= new Map();
  return state.__hdcMilwaukeeJobs;
}

function view({ key: _key, ...job }: Job): JobView {
  void _key;
  return {
    ...job,
    startedAt: new Date(job.startedAt).toISOString(),
    finishedAt: job.finishedAt == null ? null : new Date(job.finishedAt).toISOString(),
  };
}

/** Σβήνει ό,τι έληξε και, πάνω από το όριο, τις παλαιότερες εργασίες που τελείωσαν. */
function prune(now: number) {
  const map = jobs();
  for (const [id, job] of map) {
    const since = job.finishedAt ?? job.startedAt;
    if (now - since > JOB_TTL_MS) map.delete(id);
  }
  if (map.size <= MAX_JOBS) return;
  const finished = [...map.values()]
    .filter((j) => j.status !== "running")
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  for (const job of finished) {
    if (map.size <= MAX_JOBS) break;
    map.delete(job.id);
  }
}

/**
 * Ίδια δουλειά = ίδιο είδος και ίδιο item. Η ενεργοποίηση είναι μία τη φορά
 * για όλο το HDCtool (409 εκεί), άρα κάθε ενεργοποίηση που τρέχει «πιάνει»
 * τη θέση· ίδια όμως είναι μόνο με το ίδιο σύνολο ids (`key`).
 */
function sameSlot(job: Job, kind: JobKind, itemId: string | null) {
  return job.status === "running" && job.kind === kind && (kind === "bulk-activate" || job.itemId === itemId);
}

const BUSY_ACTIVATION = "Τρέχει ήδη μια ενεργοποίηση· δοκιμάστε σε λίγο";

export type StartJob = {
  kind: JobKind;
  itemId: string | null;
  /** Τι ακριβώς κάνει: η επαναχρησιμοποίηση θέλει ίδιο `key` (π.χ. ίδια ids). */
  key?: string | null;
  actor: string;
  run: () => Promise<MilwaukeeResult<object>>;
  /** Μετά το τέλος (επιτυχία ή αποτυχία): π.χ. η καταγραφή στο audit. Δεν επηρεάζει την εργασία. */
  onFinish?: (job: JobView) => Promise<void> | void;
};

export type StartResult = { ok: true; job: JobView; reused: boolean } | { ok: false; error: string };

/**
 * Ξεκινά την εργασία χωρίς να την περιμένει. Αν τρέχει ήδη η ίδια ενέργεια
 * από τον ίδιο χρήστη, επιστρέφει εκείνη· από άλλον χρήστη, άρνηση.
 */
export function startJob(input: StartJob): StartResult {
  const now = Date.now();
  prune(now);
  const key = input.key ?? null;
  const running = [...jobs().values()].find((j) => sameSlot(j, input.kind, input.itemId));
  if (running) {
    // Άλλα ids: το αποτέλεσμα εκείνης δεν αφορά αυτό το αίτημα (ψεύτικο «Ενεργοποιήθηκε»).
    if (running.key !== key) return { ok: false, error: BUSY_ACTIVATION };
    if (running.actor !== input.actor) {
      return { ok: false, error: `Τρέχει ήδη η ίδια ενέργεια από ${running.actor}· δοκιμάστε σε λίγο` };
    }
    return { ok: true, job: view(running), reused: true };
  }

  const job: Job = {
    id: randomUUID(),
    kind: input.kind,
    itemId: input.itemId,
    key,
    actor: input.actor,
    startedAt: now,
    finishedAt: null,
    status: "running",
    result: null,
    error: null,
  };
  jobs().set(job.id, job);

  const finish = (result: MilwaukeeResult<object>) => {
    job.finishedAt = Date.now();
    job.result = result;
    job.status = result.ok ? "done" : "failed";
    job.error = result.ok ? null : result.error;
  };

  void (async () => {
    try {
      finish(await input.run());
    } catch (error) {
      finish({ ok: false, status: 0, error: error instanceof Error ? error.message : String(error) });
    }
    try {
      await input.onFinish?.(view(job));
    } catch (error) {
      console.error("[admin/milwaukee] job onFinish", job.kind, error instanceof Error ? error.message : String(error));
    }
  })();

  return { ok: true, job: view(job), reused: false };
}

/** Η κατάσταση μιας εργασίας, ή `null` αν δεν υπάρχει (ή έληξε). */
export function getJob(id: string): JobView | null {
  prune(Date.now());
  const job = jobs().get(id);
  return job ? view(job) : null;
}

/** Μόνο για τα τεστ. */
export function clearJobs() {
  jobs().clear();
}
