import { describe, expect, it } from "vitest";
import { modelPath, modelRootFromSlug, modelSlug } from "@/lib/milwaukee/model-slug";

describe("model slugs", () => {
  it("turns a model root into its address and back", () => {
    for (const root of ["M18 FPD3", "M12 FID2", "MXF DCD150", "M18 ONEFHIWF12"]) {
      expect(modelRootFromSlug(modelSlug(root))).toBe(root);
    }
    expect(modelSlug("M18 FPD3")).toBe("m18-fpd3");
    expect(modelPath("MXF DCD150")).toBe("/montelo/mxf-dcd150");
  });

  it("refuses what is not a model", () => {
    for (const slug of ["m18", "m18-", "m24-fpd3", "m18-fpd3-502x", "m18-3fpd", "../etc"]) {
      expect(modelRootFromSlug(slug), slug).toBeNull();
    }
  });

  it("accepts any case", () => {
    expect(modelRootFromSlug("M18-FPD3")).toBe("M18 FPD3");
  });
});
