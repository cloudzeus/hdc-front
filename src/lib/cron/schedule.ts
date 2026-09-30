/**
 * The shop's recurring jobs, running inside the server.
 *
 * They used to be HTTP routes for a platform scheduler to call. That meant a
 * Coolify "Scheduled Task" per job, a CRON_SECRET to create and copy, and a
 * deployment that works only if somebody remembered to set all of it up again.
 * Like the nightly reconcile (`src/lib/sync/reconcile-schedule.ts`), they now
 * ship with the code and start with the server.
 *
 * Several replicas all tick; `claimSlot` lets exactly one of them run each
 * interval. The routes under /api/cron stay, for running a job by hand.
 */

export type CronJobName = "catalog" | "orders" | "content";

type CronJob = {
  name: CronJobName;
  /** How often the job should run, across all replicas together. */
  everyMs: number;
  /** Runs the job and returns one line for the deployment log. */
  run: () => Promise<string>;
};

/** How often each server looks at the clock. */
const TICK_MS = 60_000;

/**
 * A tick lands anywhere inside its minute, so a gap of exactly `everyMs` would
 * sometimes wait a whole extra tick. Half a tick of slack keeps the rhythm.
 */
const SLACK_MS = TICK_MS / 2;

const JOBS: readonly CronJob[] = [
  {
    // HDCtool's change feed is a push to one consumer, which is the Kolleris
    // eshop. This shop asks for the changes instead, every five minutes.
    name: "catalog",
    everyMs: 5 * 60_000,
    run: async () => {
      const { pollCatalogDelta } = await import("@/lib/sync/delta-poll");
      const result = await pollCatalogDelta();
      return JSON.stringify(result);
    },
  },
  {
    // ERP documents still missing, ACS delivery checks, review requests.
    // ACS does not scan more often than this, and reviews count in days.
    name: "orders",
    everyMs: 30 * 60_000,
    run: async () => {
      const { sweepOrders } = await import("@/lib/orders/delivery-sweep");
      const report = await sweepOrders();
      if (report.errors.length > 0) {
        console.error(`[cron:orders] ${report.errors.length} σφάλματα`, report.errors);
      }
      return (
        `παραστατικά ${report.documentsIssued} · ελέγχθηκαν ${report.checked} · ` +
        `παραδόθηκαν ${report.delivered} · αιτήσεις αξιολόγησης ${report.reviewsRequested}`
      );
    },
  },
  {
    // Automatic articles (src/lib/content-auto): the topic queue once a day,
    // and — only when «Αυτόματα άρθρα» is on, on weekdays 09:00–19:00 Athens
    // time — at most one article when the adaptive cadence says so.
    name: "content",
    everyMs: 60 * 60_000,
    run: async () => {
      const { contentTick } = await import("@/lib/content-auto/cron");
      return contentTick();
    },
  },
];

type Env = Partial<Record<"NODE_ENV" | "IN_PROCESS_CRON" | "CRON_DISABLED" | "HDCTOOL_API_KEY", string>>;

/**
 * Which jobs this server should run. Pure, for the test.
 *
 * - Off in development unless IN_PROCESS_CRON=1: `npm run dev` on a laptop can
 *   point at the real database and would send real customers real emails.
 * - IN_PROCESS_CRON=0 turns everything off, in any environment.
 * - CRON_DISABLED=orders (comma-separated) turns off single jobs.
 * - The catalog job needs HDCtool; without a key it would only fail every
 *   five minutes saying so.
 */
export function plannedJobs(env: Env): CronJobName[] {
  if (env.IN_PROCESS_CRON === "0") return [];
  if (env.NODE_ENV !== "production" && env.IN_PROCESS_CRON !== "1") return [];

  const disabled = new Set(
    (env.CRON_DISABLED ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );
  return JOBS.map((job) => job.name).filter((name) => {
    if (disabled.has(name)) return false;
    if (name === "catalog" && !env.HDCTOOL_API_KEY) return false;
    return true;
  });
}

let started = false;

/**
 * Start the timers. Safe to call more than once; only the first call counts.
 *
 * Returns at once: `register()` in `instrumentation.ts` holds back every
 * request until it resolves.
 */
export function startCronJobs(): void {
  if (started) return;
  const names = plannedJobs(process.env as Env);
  if (names.length === 0) return;
  started = true;

  const jobs = JOBS.filter((job) => names.includes(job.name));
  const running = new Set<CronJobName>();

  const tick = async () => {
    const { claimSlot, ensureSlot, finishSlot } = await import("@/lib/cron/claim");
    for (const job of jobs) {
      if (running.has(job.name)) continue;
      const channel = `cron:${job.name}`;
      running.add(job.name);
      // Not awaited in the loop: a slow order sweep must not hold up the catalog.
      void (async () => {
        try {
          await ensureSlot(channel);
          if (!(await claimSlot(channel, job.everyMs - SLACK_MS))) return;
          const t0 = Date.now();
          try {
            const line = await job.run();
            await finishSlot(channel, true);
            console.log(`[cron:${job.name}] ${line} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
          } catch (error) {
            await finishSlot(channel, false).catch(() => {});
            throw error;
          }
        } catch (error) {
          // Never rethrown: an unhandled rejection from a timer takes the whole
          // server down, and a failed sweep is not a reason to stop selling.
          console.error(
            `[cron:${job.name}] failed:`,
            error instanceof Error ? error.message : String(error),
          );
        } finally {
          running.delete(job.name);
        }
      })();
    }
  };

  // The first tick comes a minute after boot, once the server is taking traffic.
  const timer = setInterval(() => {
    void tick().catch((error) => console.error("[cron] tick failed:", error));
  }, TICK_MS);
  timer.unref?.();

  console.log(
    `[cron] started in-process: ${jobs.map((job) => `${job.name} every ${job.everyMs / 60_000}′`).join(", ")}`,
  );
}
