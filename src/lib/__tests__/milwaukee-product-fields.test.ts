import { describe, expect, it } from "vitest";
import { milwaukeeFields } from "@/lib/milwaukee/product-fields";

describe("milwaukeeFields", () => {
  it("reads platform, root, content and flags from a real kit name", () => {
    expect(
      milwaukeeFields("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ  M18FPD3-502X FUEL 4933479860"),
    ).toEqual({
      platform: "M18",
      modelRoot: "M18 FPD3",
      modelContent: "kit",
      isFuel: true,
      isOneKey: false,
    });
  });

  it("falls back to platform-only when the name has no tool code", () => {
    expect(milwaukeeFields("ΤΣΟΚ Μ18 FPD2 4931479550 MILWAUKEE")).toEqual({
      platform: "M18",
      modelRoot: null,
      modelContent: null,
      isFuel: false,
      isOneKey: false,
    });
  });

  it("is all-null/false for an accessory that fits every platform", () => {
    expect(milwaukeeFields("ΤΡΥΠΑΝΙ ΜΠΕΤΟΥ SDS-PLUS 6X110")).toEqual({
      platform: null,
      modelRoot: null,
      modelContent: null,
      isFuel: false,
      isOneKey: false,
    });
  });
});
