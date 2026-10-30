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

  // These are plain-text messages the call site renders with simple {name}
  // interpolation. A FORMAT TYPE on an existing arg parses fine but can throw at
  // render on the string the call site passes — e.g. a time/date formatter over
  // "18:00" → next-intl degrades to the raw key on a live page. So any complex
  // ICU form is rejected, even over an argument the base already provides.
  it("rejects a time formatter attached to a string argument (would throw at render)", () => {
    expect(isPlaceholderSafe("Ανοιχτά τώρα · έως {time}", "Ανοιχτά τώρα · έως {time, time, short}")).toBe(false);
  });

  it("rejects a date formatter attached to a string argument", () => {
    expect(isPlaceholderSafe("έως {time}", "έως {time, date, ::Hm}")).toBe(false);
  });

  it("rejects a number formatter over an existing argument", () => {
    expect(isPlaceholderSafe("άνω των {amount} €", "άνω των {amount, number, ::.00} €")).toBe(false);
  });

  it("rejects a plural form (a complex ICU form, not plain interpolation)", () => {
    expect(isPlaceholderSafe("{count} προϊόντα", "{count, plural, one {ένα} other {# προϊόντα}}")).toBe(false);
  });

  it("still allows a plain reorder of simple placeholders", () => {
    expect(isPlaceholderSafe("Δευ {open}–{close}", "{open} ως {close}")).toBe(true);
  });
});
