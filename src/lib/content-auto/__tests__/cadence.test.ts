import { describe, expect, it } from "vitest";
import { athensTime, cadence, inWorkingWindow, minGapDays, weeklyTarget, type CadenceInput } from "@/lib/content-auto/cadence";

// 30/9/2026 is a Wednesday; Athens is UTC+3 (summer time) until 25/10.
const wed10 = new Date("2026-09-30T07:00:00Z"); // 10:00 Athens

const input = (over: Partial<CadenceInput> = {}): CadenceInput => ({
  now: wed10,
  enabled: true,
  backlog: 25,
  maxPerWeek: 3,
  published: [],
  attemptsToday: 0,
  ...over,
});

describe("athensTime and the working window", () => {
  it("reads the Athens clock, summer and winter", () => {
    expect(athensTime(wed10)).toEqual({ weekday: 3, hour: 10, date: "2026-09-30" });
    expect(athensTime(new Date("2026-12-01T07:30:00Z"))).toMatchObject({ weekday: 2, hour: 9 });
  });

  it("is open on weekdays from 09:00 to 19:00 only", () => {
    expect(inWorkingWindow(new Date("2026-09-30T05:59:00Z"))).toBe(false); // 08:59
    expect(inWorkingWindow(new Date("2026-09-30T06:00:00Z"))).toBe(true); // 09:00
    expect(inWorkingWindow(new Date("2026-09-30T15:59:00Z"))).toBe(true); // 18:59
    expect(inWorkingWindow(new Date("2026-09-30T16:00:00Z"))).toBe(false); // 19:00
    expect(inWorkingWindow(new Date("2026-10-03T08:00:00Z"))).toBe(false); // Saturday 11:00
  });
});

describe("weeklyTarget", () => {
  it("adapts to the backlog", () => {
    expect(weeklyTarget(20, 3)).toBe(3);
    expect(weeklyTarget(19, 3)).toBe(2);
    expect(weeklyTarget(5, 3)).toBe(2);
    expect(weeklyTarget(4, 3)).toBe(1);
  });

  it("never goes above the setting or the hard cap of 3", () => {
    expect(weeklyTarget(50, 1)).toBe(1);
    expect(weeklyTarget(50, 9)).toBe(3);
    expect(weeklyTarget(50, null)).toBe(3);
    expect(weeklyTarget(50, 0)).toBe(1);
  });

  it("spreads the week out", () => {
    expect(minGapDays(3)).toBe(2);
    expect(minGapDays(2)).toBe(3);
    expect(minGapDays(1)).toBe(7);
  });
});

describe("cadence", () => {
  it("writes when on, in hours, with a backlog and nothing recent", () => {
    expect(cadence(input())).toMatchObject({ write: true, target: 3 });
  });

  it("does nothing when off, out of hours or with an empty queue", () => {
    expect(cadence(input({ enabled: false })).write).toBe(false);
    expect(cadence(input({ now: new Date("2026-10-03T08:00:00Z") })).write).toBe(false);
    expect(cadence(input({ backlog: 0 })).write).toBe(false);
  });

  it("stops at the weekly target", () => {
    const published = [new Date("2026-09-24T08:00:00Z"), new Date("2026-09-26T08:00:00Z"), new Date("2026-09-28T08:00:00Z")];
    expect(cadence(input({ published })).reason).toMatch(/3\/3/);
    expect(cadence(input({ backlog: 10, published: published.slice(1) })).write).toBe(false);
  });

  it("publishes at most one a day", () => {
    expect(cadence(input({ published: [new Date("2026-09-30T06:30:00Z")] })).reason).toMatch(/σήμερα/);
  });

  it("waits the gap after the last one", () => {
    expect(cadence(input({ published: [new Date("2026-09-29T08:00:00Z")] })).write).toBe(false); // 1 day, gap 2
    expect(cadence(input({ published: [new Date("2026-09-28T08:00:00Z")] })).write).toBe(true); // 2 days
    expect(cadence(input({ backlog: 10, published: [new Date("2026-09-28T08:00:00Z")] })).write).toBe(false); // gap 3
  });

  it("stops after two attempts in a day, whatever their outcome", () => {
    expect(cadence(input({ attemptsToday: 2 })).write).toBe(false);
  });
});
