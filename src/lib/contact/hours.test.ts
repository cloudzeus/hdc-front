import { describe, expect, it } from "vitest";
import { SHOP } from "@/config/shop";
import { hoursMessageArgs, openState, openingHoursSpecification } from "@/lib/contact/hours";

/**
 * Times are given as UTC and read back in Europe/Athens, which is the whole
 * point: the server may run anywhere, and Greece observes DST — a fixed +2
 * offset is wrong for half the year and nobody notices until October.
 *
 * The schedule is passed explicitly so the tests do not move when the shop's
 * hours do: Mon–Fri 08:00–16:00, Sat 09:00–14:00, Sun closed.
 */
const HOURS = {
  weekdays: { open: "08:00", close: "16:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: null,
};
const at = (iso: string) => openState(new Date(iso), HOURS);

describe("openState", () => {
  it("is open mid-morning on a weekday", () => {
    // Fri 31 Jul 2026, 10:00 UTC = 13:00 Athens (summer, +3).
    const state = at("2026-07-31T10:00:00Z");
    expect(state.open).toBe(true);
    expect(state.now).toBe("13:00");
    expect(state.label).toEqual({ state: "open", until: "16:00" });
  });

  it("is closed before opening, and says when it opens", () => {
    // Fri 06:00 Athens.
    const state = at("2026-07-31T03:00:00Z");
    expect(state.open).toBe(false);
    expect(state.label).toEqual({ state: "opens", when: "today", at: "08:00" });
  });

  it("is closed after 16:00 and points at the next day", () => {
    // Thu 17:00 Athens.
    const state = at("2026-07-30T14:00:00Z");
    expect(state.open).toBe(false);
    expect(state.label).toEqual({ state: "opens", when: "tomorrow", at: "08:00" });
  });

  it("points at Saturday's 09:00 from Friday evening", () => {
    // Fri 20:00 Athens → Saturday opens at 09:00.
    const state = at("2026-07-31T17:00:00Z");
    expect(state.open).toBe(false);
    expect(state.label).toEqual({ state: "opens", when: "tomorrow", at: "09:00" });
  });

  it("is open on Saturday 09:00-14:00 only", () => {
    expect(at("2026-08-01T05:59:00Z").open).toBe(false); // Sat 08:59
    const sat = at("2026-08-01T09:00:00Z"); // Sat 12:00
    expect(sat.open).toBe(true);
    expect(sat.label).toEqual({ state: "open", until: "14:00" });
    expect(sat.minutesUntilChange).toBe(120);
    expect(at("2026-08-01T11:00:00Z").open).toBe(false); // Sat 14:00
  });

  it("skips Sunday: from Saturday afternoon the next opening is Monday", () => {
    const state = at("2026-08-01T12:00:00Z"); // Sat 15:00
    expect(state.open).toBe(false);
    // 1 = Monday, in `Date#getDay` numbering.
    expect(state.label).toEqual({ state: "opens", when: "day", day: 1, at: "08:00" });
    expect(at("2026-08-02T09:00:00Z").open).toBe(false); // Sun 12:00
    expect(at("2026-08-02T09:00:00Z").label).toEqual({ state: "opens", when: "tomorrow", at: "08:00" });
  });

  it("handles winter time, when Athens is +2 not +3", () => {
    // Mon 12 Jan 2026, 07:00 UTC = 09:00 Athens — open.
    const winter = at("2026-01-12T07:00:00Z");
    expect(winter.now).toBe("09:00");
    expect(winter.open).toBe(true);
  });

  it("counts the minutes left so the page can nudge", () => {
    // Fri 15:30 Athens, half an hour before close.
    const state = at("2026-07-31T12:30:00Z");
    expect(state.open).toBe(true);
    expect(state.minutesUntilChange).toBe(30);
  });

  it("defaults to the shop's own schedule", () => {
    expect(SHOP.contact.hours.saturday).toEqual({ open: "09:00", close: "14:00" });
    expect(openState(new Date("2026-08-01T09:00:00Z")).open).toBe(true); // Sat 12:00
  });
});

describe("hours output", () => {
  it("gives the message files both windows", () => {
    expect(hoursMessageArgs(HOURS)).toEqual({
      open: "08:00",
      close: "16:00",
      satOpen: "09:00",
      satClose: "14:00",
    });
  });

  it("publishes Saturday in the JSON-LD, and no Sunday", () => {
    const spec = openingHoursSpecification(HOURS);
    expect(spec).toHaveLength(2);
    expect(spec[1]).toMatchObject({ dayOfWeek: ["Saturday"], opens: "09:00", closes: "14:00" });
  });
});
