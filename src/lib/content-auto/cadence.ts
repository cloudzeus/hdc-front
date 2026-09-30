/**
 * When the cron writes (spec §7). Pure: the job passes the clock, the
 * settings and what was written, and gets «write» or why not.
 *
 * - Only when `content.auto.enabled`, on weekdays 09:00–19:00 Athens time.
 * - Target per week from the backlog (topics scored ≥ the threshold):
 *   ≥ 20 → 3, 5–19 → 2, < 5 → 1; never above `content.auto.maxPerWeek`
 *   and never above the hard cap of 3.
 * - At most 1 published a day, and spread out: after a publication the next
 *   waits 2 days at 3 a week, 3 days at 2 a week (Mon–Wed–Fri, Mon–Thu).
 * - At most 2 attempts a day of any outcome, so a run of failed drafts cannot
 *   spend DeepSeek tokens every hour.
 */

export const HARD_CAP_PER_WEEK = 3;
export const MAX_ATTEMPTS_PER_DAY = 2;
export const WINDOW = { from: 9, to: 19 } as const;

const DAY = 86_400_000;

export type AthensTime = { weekday: number; hour: number; date: string };

/** Weekday (1 = Monday … 7 = Sunday), hour and calendar date in Europe/Athens. */
export function athensTime(now: Date): AthensTime {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { weekday, hour: Number(get("hour")), date: `${get("year")}-${get("month")}-${get("day")}` };
}

export function inWorkingWindow(now: Date): boolean {
  const t = athensTime(now);
  return t.weekday >= 1 && t.weekday <= 5 && t.hour >= WINDOW.from && t.hour < WINDOW.to;
}

export function weeklyTarget(backlog: number, maxPerWeek: number | null): number {
  const adaptive = backlog >= 20 ? 3 : backlog >= 5 ? 2 : 1;
  const cap = Math.min(HARD_CAP_PER_WEEK, Math.max(1, Math.floor(maxPerWeek ?? HARD_CAP_PER_WEEK)));
  return Math.min(adaptive, cap);
}

/** Days to wait after a publication: 7 / target, rounded down, at least 2. */
export function minGapDays(target: number): number {
  return Math.max(2, Math.floor(7 / Math.max(1, target)));
}

/** Whole calendar days between two Athens dates ("2026-09-28" → "2026-09-30" = 2). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

export type CadenceInput = {
  now: Date;
  enabled: boolean;
  backlog: number;
  maxPerWeek: number | null;
  /** When auto articles were published (the last 7 days are enough). */
  published: Date[];
  /** Cron attempts today, any outcome. */
  attemptsToday: number;
};

export type CadenceDecision = { write: boolean; target: number; reason: string };

export function cadence(input: CadenceInput): CadenceDecision {
  const target = weeklyTarget(input.backlog, input.maxPerWeek);
  const no = (reason: string): CadenceDecision => ({ write: false, target, reason });
  if (!input.enabled) return no("ανενεργό");
  if (!inWorkingWindow(input.now)) return no("εκτός ωραρίου (εργάσιμες 09:00–19:00)");
  if (input.backlog === 0) return no("κανένα θέμα στην ουρά");

  const today = athensTime(input.now).date;
  const week = input.published.filter((d) => input.now.getTime() - d.getTime() < 7 * DAY);
  if (week.length >= target) return no(`${week.length}/${target} αυτή την εβδομάδα`);
  const dates = input.published.map((d) => athensTime(d).date).sort();
  const last = dates.at(-1);
  if (last === today) return no("ήδη ένα σήμερα");
  if (last && daysBetween(last, today) < minGapDays(target)) {
    return no(`το προηγούμενο πριν από ${daysBetween(last, today)} ημέρες (ελάχιστο ${minGapDays(target)})`);
  }
  if (input.attemptsToday >= MAX_ATTEMPTS_PER_DAY) return no(`${input.attemptsToday} προσπάθειες σήμερα`);
  return { write: true, target, reason: `στόχος ${target} την εβδομάδα, ${week.length} μέχρι τώρα` };
}
