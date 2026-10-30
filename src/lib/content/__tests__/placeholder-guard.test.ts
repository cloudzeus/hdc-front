import { describe, expect, it } from "vitest";
import { icuArgNames, isPlaceholderSafe } from "@/lib/content/messages";

describe("icuArgNames", () => {
  it("collects simple {name} arguments", () => {
    expect([...icuArgNames("{products}+ κωδικοί, {brands} brands")]).toEqual(["products", "brands"]);
  });

  it("collects the leading arg of a complex ICU form", () => {
    expect([...icuArgNames("{count, plural, one {ένα} other {# προϊόντα}}")]).toContain("count");
  });

  it("is empty for plain text", () => {
    expect(icuArgNames("καθόλου μεταβλητές").size).toBe(0);
  });
});

describe("isPlaceholderSafe", () => {
  const base = "Δωρεάν courier για παραγγελίες πάνω από {amount}";

  it("allows edits that keep the same placeholders", () => {
    expect(isPlaceholderSafe(base, "Πάνω από {amount} δωρεάν μεταφορικά")).toBe(true);
  });

  it("allows dropping a placeholder (number simply won't show, never throws)", () => {
    expect(isPlaceholderSafe(base, "Δωρεάν μεταφορικά σε όλη την Ελλάδα")).toBe(true);
  });

  it("rejects a NEW placeholder the catalogue never provided", () => {
    expect(isPlaceholderSafe(base, "Δωρεάν courier πάνω από {whatever}")).toBe(false);
  });

  it("rejects an unbalanced brace (a parse error waiting to happen)", () => {
    expect(isPlaceholderSafe(base, "Δωρεάν courier πάνω από {amount")).toBe(false);
  });

  it("rejects any placeholder when the base had none", () => {
    expect(isPlaceholderSafe("απλό κείμενο", "κείμενο με {var}")).toBe(false);
  });

  it("allows plain-text edits of a plain-text base", () => {
    expect(isPlaceholderSafe("απλό κείμενο", "άλλο απλό κείμενο")).toBe(true);
  });

  // Brace-balanced + no-new-arg is not enough: a malformed plural/select still
  // breaks at render (next-intl logs onError and shows the raw key). The guard
  // must reject anything the ICU parser can't parse.
  it("rejects a plural form missing its required other clause", () => {
    expect(isPlaceholderSafe("{count} προϊόντα", "{count, plural, one {ένα}}")).toBe(false);
  });

  it("rejects a malformed argument type", () => {
    expect(isPlaceholderSafe(base, "Διαθέσιμα {amount, 2000}")).toBe(false);
  });

  it("allows a well-formed plural over an existing argument", () => {
    expect(isPlaceholderSafe("{count} προϊόντα", "{count, plural, one {ένα} other {# προϊόντα}}")).toBe(true);
  });
});
