import { describe, expect, it } from "vitest";
import { brandScopeProblem } from "@/lib/offers/offer-types";

describe("brand scope is legacy only", () => {
  it("refuses a new offer scoped to a brand", () => {
    expect(brandScopeProblem({ scope: "brand", brandSlug: "milwaukee" }, null)).toMatch(/εύρος μάρκας/);
  });
  it("refuses turning an existing offer into a brand offer", () => {
    expect(brandScopeProblem({ scope: "brand", brandSlug: "milwaukee" }, { scope: "products", brandSlug: null })).not.toBeNull();
  });
  it("refuses moving a legacy brand offer to another brand", () => {
    expect(brandScopeProblem({ scope: "brand", brandSlug: "knipex" }, { scope: "brand", brandSlug: "milwaukee" })).not.toBeNull();
  });
  it("lets an existing brand offer be saved as it is", () => {
    expect(brandScopeProblem({ scope: "brand", brandSlug: "milwaukee" }, { scope: "brand", brandSlug: "milwaukee" })).toBeNull();
  });
  it("does not touch product and category scopes", () => {
    expect(brandScopeProblem({ scope: "products", brandSlug: "" }, null)).toBeNull();
    expect(brandScopeProblem({ scope: "category", brandSlug: "" }, null)).toBeNull();
  });
});
