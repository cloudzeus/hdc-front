import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { summarizeFamily } from "@/lib/catalog/variants";

const glove = (size: string, inStock: boolean, slug = `gantia-${size.replace("/", "-").toLowerCase()}`) => ({
  slug,
  name: `ΓΑΝΤΙΑ HI-DEX LEVEL B ${size}`,
  inStock,
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
    expect(s).toEqual({ count: 4, inStock: true, openSlug: "gantia-8-m" });
  });

  it("has no opening size when nothing is in stock", () => {
    const s = summarizeFamily([glove("7/S", false), glove("8/M", false)]);
    expect(s.inStock).toBe(false);
    expect(s.openSlug).toBeNull();
  });
});
