import { describe, expect, it } from "vitest";
import { parseModelQuery, searchRedirectPath } from "@/lib/seo/search-redirect";

describe("parseModelQuery", () => {
  it("reads a model however it is typed", () => {
    for (const q of ["M18 FPD3", "m18 fpd3", "m18fpd3", "M18-FPD3", " Μ18 FPD3 "]) {
      expect(parseModelQuery(q), q).toEqual({ root: "M18 FPD3", code: null });
    }
    expect(parseModelQuery("mx fuel dcd150")).toEqual({ root: "MXF DCD150", code: null });
  });

  it("reads a full model code", () => {
    expect(parseModelQuery("m18 fpd3-502x")).toEqual({ root: "M18 FPD3", code: "M18 FPD3-502X" });
    expect(parseModelQuery("M18FPD3-0X")).toEqual({ root: "M18 FPD3", code: "M18 FPD3-0X" });
  });

  it("is not a model when it is a phrase, a code or a word", () => {
    for (const q of ["δράπανο M18 FPD3", "4933479860", "M18", "μπαταρία", "M18 FPD3 κιτ"]) {
      expect(parseModelQuery(q), q).toBeNull();
    }
  });
});

describe("searchRedirectPath", () => {
  const versions = [
    { slug: "fpd3-0x", code: "M18 FPD3-0X" },
    { slug: "fpd3-502x", code: "M18 FPD3-502X" },
  ];

  it("sends a code of exactly one product to that product", () => {
    expect(searchRedirectPath({ codeMatches: ["fpd3-502x"], model: null, modelVersions: [] })).toBe("/proion/fpd3-502x");
  });

  it("keeps a code shared by two products a search", () => {
    expect(searchRedirectPath({ codeMatches: ["a", "b"], model: null, modelVersions: [] })).toBeNull();
  });

  it("sends a model to its model page, and a full code to its one version", () => {
    expect(searchRedirectPath({ codeMatches: [], model: { root: "M18 FPD3", code: null }, modelVersions: versions })).toBe(
      "/montelo/m18-fpd3",
    );
    expect(
      searchRedirectPath({ codeMatches: [], model: { root: "M18 FPD3", code: "M18 FPD3-502X" }, modelVersions: versions }),
    ).toBe("/proion/fpd3-502x");
    expect(
      searchRedirectPath({ codeMatches: [], model: { root: "M18 FPD3", code: "M18 FPD3-602X" }, modelVersions: versions }),
    ).toBe("/montelo/m18-fpd3");
  });

  it("stays a search for a model the store does not list", () => {
    expect(searchRedirectPath({ codeMatches: [], model: { root: "M18 ZZZ", code: null }, modelVersions: [] })).toBeNull();
  });
});
