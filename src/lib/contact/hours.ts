import { SHOP } from "@/config/shop";

/**
 * Opening hours — pure, so the store band, the contact page and their tests
 * all use the same answer.
 *
 * Athens time, computed from the request's own clock. Rendering "ανοιχτά" from
 * a hardcoded string is the kind of small lie that costs a phone call at 21:00
 * and a customer who does not call again.
 *
 * The schedule itself lives in `SHOP.contact.hours` (src/config/shop.ts):
 * Monday–Friday one window, Saturday its own, Sunday closed.
 */

export const TIMEZONE = "Europe/Athens";

/** One day's window, "HH:MM" 24h, or `null` for closed. */
export type DayHours = { readonly open: string; readonly close: string } | null;

export type WeeklyHours = {
  readonly weekdays: DayHours;
  readonly saturday: DayHours;
  readonly sunday: DayHours;
};

/** The window for a `Date#getDay` day (0 = Sunday … 6 = Saturday). */
export function dayHours(hours: WeeklyHours, day: number): DayHours {
  if (day === 0) return hours.sunday;
  if (day === 6) return hours.saturday;
  return hours.weekdays;
}

/**
 * What to say, not the words to say it in.
 *
 * The function stays pure and language-free: it decides *that* the shop opens
 * tomorrow at 08:00, and the page decides how to phrase that in Greek, English
 * or Italian.
 */
export type OpenLabel =
  | { state: "open"; until: string }
  // One literal per member, so `when` actually discriminates the union.
  | { state: "opens"; when: "today"; at: string }
  | { state: "opens"; when: "tomorrow"; at: string }
  | { state: "opens"; when: "day"; day: number; at: string };

export type OpenState = {
  open: boolean;
  label: OpenLabel;
  /** Local Athens time the state was computed at, `HH:MM`. */
  now: string;
  /** Minutes until the state flips, for the "κλείνει σε 20'" nudge. */
  minutesUntilChange: number;
};

/**
 * Reads the wall clock in Athens regardless of where the server runs.
 *
 * `Intl` rather than an offset constant: Greece observes DST, so a fixed +2 is
 * wrong for half the year and nobody notices until October.
 */
function athensParts(at: Date): { day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    day: days.indexOf(get("weekday")),
    // `24` shows up at midnight in some ICU versions.
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const pad = (n: number) => String(n).padStart(2, "0");

export function openState(at: Date, hours: WeeklyHours = SHOP.contact.hours): OpenState {
  const { day, hour, minute } = athensParts(at);
  const now = hour * 60 + minute;
  const nowLabel = `${pad(hour)}:${pad(minute)}`;
  const today = dayHours(hours, day);

  if (today && now >= minutesOf(today.open) && now < minutesOf(today.close)) {
    return {
      open: true,
      label: { state: "open", until: today.close },
      now: nowLabel,
      minutesUntilChange: minutesOf(today.close) - now,
    };
  }

  // Later today, or the next day that has hours at all. At most seven steps,
  // so a schedule with every day closed cannot loop forever.
  let daysAhead = -1;
  let next: DayHours = null;
  if (today && now < minutesOf(today.open)) {
    daysAhead = 0;
    next = today;
  } else {
    for (let i = 1; i <= 7; i += 1) {
      const candidate = dayHours(hours, (day + i) % 7);
      if (candidate) {
        daysAhead = i;
        next = candidate;
        break;
      }
    }
  }

  if (!next) {
    // Never opens: say "closed" and let the page print the schedule.
    return {
      open: false,
      label: { state: "opens", when: "day", day, at: "" },
      now: nowLabel,
      minutesUntilChange: 0,
    };
  }

  const label: OpenLabel =
    daysAhead === 0
      ? { state: "opens", when: "today", at: next.open }
      : daysAhead === 1
        ? { state: "opens", when: "tomorrow", at: next.open }
        : { state: "opens", when: "day", day: (day + daysAhead) % 7, at: next.open };

  return {
    open: false,
    label,
    now: nowLabel,
    minutesUntilChange: daysAhead * 24 * 60 + minutesOf(next.open) - now,
  };
}

/** Is the store open right now? Athens time, whatever timezone the server runs in. */
export function isStoreOpen(hours: WeeklyHours = SHOP.contact.hours, now: Date = new Date()): boolean {
  return openState(now, hours).open;
}

/**
 * The values the "orario" messages interpolate:
 * "Δευ–Παρ {open}–{close} · Σάβ {satOpen}–{satClose}".
 */
export function hoursMessageArgs(hours: WeeklyHours = SHOP.contact.hours) {
  return {
    open: hours.weekdays?.open ?? "",
    close: hours.weekdays?.close ?? "",
    satOpen: hours.saturday?.open ?? "",
    satClose: hours.saturday?.close ?? "",
  };
}

/** schema.org `OpeningHoursSpecification` entries, one per window. */
export function openingHoursSpecification(hours: WeeklyHours = SHOP.contact.hours) {
  const spec: Array<{ "@type": "OpeningHoursSpecification"; dayOfWeek: string[]; opens: string; closes: string }> = [];
  if (hours.weekdays)
    spec.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: hours.weekdays.open,
      closes: hours.weekdays.close,
    });
  if (hours.saturday)
    spec.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Saturday"],
      opens: hours.saturday.open,
      closes: hours.saturday.close,
    });
  if (hours.sunday)
    spec.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Sunday"],
      opens: hours.sunday.open,
      closes: hours.sunday.close,
    });
  return spec;
}
