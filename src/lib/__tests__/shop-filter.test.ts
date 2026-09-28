import { describe, expect, it } from "vitest";
import { isShopProduct } from "@/lib/sync/shop-filter";

const product = (mtrmark: number | null) => ({ brand: { mtrmark } });

describe("isShopProduct", () => {
  it("keeps Milwaukee", () => {
    expect(isShopProduct(product(1364))).toBe(true);
  });
  it("drops every other brand, and products with no brand", () => {
    expect(isShopProduct(product(1029))).toBe(false);
    expect(isShopProduct(product(null))).toBe(false);
    expect(isShopProduct({ brand: null })).toBe(false);
  });
});
