import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { dedupeSizes, summarizeFamily, type VariantOption } from "@/lib/catalog/variants";

const glove = (size: string, inStock: boolean, slug = `gantia-${size.replace("/", "-").toLowerCase()}`) => ({
  slug,
  name: `ΓΑΝΤΙΑ HI-DEX LEVEL B ${size}`,
  inStock,
  supplierAvailable: false,
  qty: inStock ? 5 : 0,
  sizes: [{ label: size.split("/")[1] ?? size }],
});

describe("summarizeFamily — where a size-family card opens", () => {
  it("opens the smallest size in stock, not the lead", () => {
    const s = summarizeFamily([
      glove("7/S", false),
      glove("10/XL", true),
      glove("8/M", true),
      glove("11/XXL", false),
    ]);
    expect(s).toEqual({ count: 4, inStock: true, availability: "stock", openSlug: "gantia-8-m" });
  });

  it("has no opening size when nothing is in stock", () => {
    const s = summarizeFamily([glove("7/S", false), glove("8/M", false)]);
    expect(s.inStock).toBe(false);
    expect(s.availability).toBe("order");
    expect(s.openSlug).toBeNull();
  });

  it("with none of ours, opens the smallest size the supplier has", () => {
    const s = summarizeFamily([
      { ...glove("7/S", false), supplierAvailable: false },
      { ...glove("9/L", false), supplierAvailable: true },
      { ...glove("8/M", false), supplierAvailable: true },
    ]);
    expect(s.availability).toBe("supplier");
    expect(s.openSlug).toBe("gantia-8-m");
  });

  it("our stock outranks the supplier's", () => {
    const s = summarizeFamily([
      { ...glove("7/S", false), supplierAvailable: true },
      { ...glove("10/XL", true), supplierAvailable: false },
    ]);
    expect(s.availability).toBe("stock");
    expect(s.openSlug).toBe("gantia-10-xl");
  });
});

describe("dedupeSizes — two codes for the same size", () => {
  const opt = (slug: string, over: Partial<VariantOption> = {}): VariantOption => ({
    slug,
    label: "42",
    code: slug,
    inStock: false,
    supplierAvailable: false,
    family: null,
    current: false,
    ...over,
  });

  it("keeps ours over the supplier's, and the supplier's over neither", () => {
    expect(dedupeSizes([opt("a"), opt("b", { supplierAvailable: true })]).map((o) => o.slug)).toEqual(["b"]);
    expect(
      dedupeSizes([opt("a", { supplierAvailable: true }), opt("b", { inStock: true })]).map((o) => o.slug),
    ).toEqual(["b"]);
    expect(
      dedupeSizes([opt("a", { inStock: true }), opt("b", { supplierAvailable: true })]).map((o) => o.slug),
    ).toEqual(["a"]);
  });

  it("always keeps the current one", () => {
    expect(dedupeSizes([opt("a", { current: true }), opt("b", { inStock: true })]).map((o) => o.slug)).toEqual(["a"]);
  });

  it("sorts by size", () => {
    expect(dedupeSizes([opt("x", { label: "44" }), opt("y", { label: "42" })]).map((o) => o.label)).toEqual(["42", "44"]);
  });
});
