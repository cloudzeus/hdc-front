import { afterEach, describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  CAPABILITY_META,
  DEFAULT_ROLE_CAPABILITIES,
  applyRoleCapabilities,
  assertCan,
  can,
  capabilitiesOf,
  normaliseCapabilities,
} from "@/lib/rbac";

const MILWAUKEE = ["milwaukee.view", "milwaukee.edit", "milwaukee.erp"] as const;

afterEach(() => applyRoleCapabilities({}));

describe("δικαιώματα Milwaukee", () => {
  it("υπάρχουν, με ελληνική ετικέτα", () => {
    for (const c of MILWAUKEE) {
      expect(CAPABILITIES).toContain(c);
      expect(CAPABILITY_META[c].label).toMatch(/Milwaukee/);
    }
  });

  it("ο Διαχειριστής τα έχει όλα", () => {
    for (const c of MILWAUKEE) expect(can("ADMIN", c)).toBe(true);
  });

  it("Συντάκτης και Λειτουργίες δεν τα έχουν από προεπιλογή", () => {
    for (const role of ["EDITOR", "OPS"] as const) {
      for (const c of MILWAUKEE) {
        expect(DEFAULT_ROLE_CAPABILITIES[role]).not.toContain(c);
        expect(can(role, c)).toBe(false);
      }
    }
  });

  it("ρόλος μόνο με προβολή: διαβάζει, δεν αλλάζει, δεν καταχωρίζει", () => {
    applyRoleCapabilities({ EDITOR: ["content", "milwaukee.view"] });
    expect(can("EDITOR", "milwaukee.view")).toBe(true);
    expect(() => assertCan("EDITOR", "milwaukee.view")).not.toThrow();
    expect(() => assertCan("EDITOR", "milwaukee.edit")).toThrow(/Forbidden/);
    expect(() => assertCan("EDITOR", "milwaukee.erp")).toThrow(/Forbidden/);
  });

  it("χωρίς ρόλο: τίποτα", () => {
    expect(() => assertCan(undefined, "milwaukee.view")).toThrow(/Forbidden/);
  });

  it("αλλαγές ή SoftOne χωρίς προβολή: η προβολή προστίθεται", () => {
    expect(normaliseCapabilities("OPS", ["milwaukee.erp"])).toEqual(["milwaukee.view", "milwaukee.erp"]);
    applyRoleCapabilities({ OPS: ["orders", "milwaukee.edit"] });
    expect(capabilitiesOf("OPS")).toEqual(["orders", "milwaukee.view", "milwaukee.edit"]);
  });
});
