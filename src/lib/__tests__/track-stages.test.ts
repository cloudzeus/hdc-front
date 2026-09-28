import { describe, expect, it } from "vitest";
import { trackStages } from "@/lib/account/track-stages";

const cp = (at: string, status: string, place: string | null = null) => ({ at, status, place });

describe("trackStages", () => {
  it("waits at the first stage before ACS scans the parcel", () => {
    expect(trackStages([]).map((s) => s.state)).toEqual(["now", "todo", "todo", "todo"]);
  });

  it("is the mockup: picked up, sorted, out for delivery", () => {
    const stages = trackStages([
      cp("2026-09-26T09:10:00", "Παραλαβή από αποστολέα", "Πειραιάς"),
      cp("2026-09-26T19:40:00", "Άφιξη στο κέντρο διαλογής", "Κέντρο ACS"),
      cp("2026-09-28T07:55:00", "Σε διανομή", "Πειραιάς"),
    ]);
    expect(stages.map((s) => s.state)).toEqual(["done", "done", "now", "todo"]);
    expect(stages[0]).toMatchObject({ key: "picked", place: "Πειραιάς" });
    expect(stages[1]).toMatchObject({ key: "sorting", place: "Κέντρο ACS" });
  });

  it("does not read «ΜΗ ΠΑΡΑΔΟΘΗΚΕ» as delivered", () => {
    const stages = trackStages([cp("2026-09-28T12:00:00", "ΜΗ ΠΑΡΑΔΟΘΗΚΕ - ΑΠΟΥΣΙΑ ΠΑΡΑΛΗΠΤΗ")]);
    expect(stages.map((s) => s.state)).toEqual(["done", "done", "now", "todo"]);
  });

  it("finishes on a delivery", () => {
    expect(trackStages([cp("2026-09-28T12:00:00", "Παραδόθηκε")]).map((s) => s.state)).toEqual([
      "done",
      "done",
      "done",
      "now",
    ]);
    expect(trackStages([], true).map((s) => s.state)).toEqual(["done", "done", "done", "done"]);
  });

  it("never goes backwards", () => {
    const stages = trackStages([cp("2026-09-28T07:55:00", "Σε διανομή"), cp("2026-09-26T09:10:00", "Παραλαβή")]);
    expect(stages[2].state).toBe("now");
  });
});
