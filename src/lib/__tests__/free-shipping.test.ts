import { describe, expect, it } from "vitest";
import { FREE_SHIPPING_THRESHOLD_NET, freeShippingProgress } from "@/lib/cart/options";

/**
 * The free-shipping bar speaks gross, the rule stays net.
 * Numbers from the approved mockup: a 99,25 € basket (M12 HB5) is 80,04 € net,
 * 53% of the 150 € net threshold, and 86,75 € short of it with VAT.
 */
describe("freeShippingProgress", () => {
  it("states the remaining amount VAT-inclusive", () => {
    const p = freeShippingProgress({
      subtotalNet: 80.04,
      subtotalGross: 99.25,
      freeShippingRemaining: 69.96,
      freeShippingReached: false,
    });
    expect(p).toEqual({ reached: false, percent: 53, remainingGross: 86.75 });
  });

  it("uses the threshold computeTotals already decided", () => {
    expect(FREE_SHIPPING_THRESHOLD_NET).toBe(150);
    const p = freeShippingProgress({
      subtotalNet: 616.4,
      subtotalGross: 764.34,
      freeShippingRemaining: 0,
      freeShippingReached: true,
    });
    expect(p).toEqual({ reached: true, percent: 100, remainingGross: 0 });
  });

  it("never shows 100% before the threshold is reached", () => {
    const p = freeShippingProgress({
      subtotalNet: 149.99,
      subtotalGross: 185.99,
      freeShippingRemaining: 0.01,
      freeShippingReached: false,
    });
    expect(p.percent).toBe(99);
    expect(p.remainingGross).toBe(0.01);
  });

  it("falls back to 24% on an empty basket", () => {
    const p = freeShippingProgress({
      subtotalNet: 0,
      subtotalGross: 0,
      freeShippingRemaining: 150,
      freeShippingReached: false,
    });
    expect(p).toEqual({ reached: false, percent: 0, remainingGross: 186 });
  });
});
