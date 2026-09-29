import { describe, expect, it } from "vitest";
import { orderLineIds } from "@/lib/checkout/line-ids";
import { xmlOnlyPimError } from "@/lib/pim/xml-only";

describe("orderLineIds", () => {
  it("keeps an ERP MTRL and sends no XML code", () => {
    expect(orderLineIds({ mtrl: 812, xmlCode: "P1" })).toEqual({ mtrl: 812, xmlCode: null });
  });

  it("sends an XML-only product with no MTRL and its XML code", () => {
    expect(orderLineIds({ mtrl: -3, xmlCode: "P1" })).toEqual({ mtrl: null, xmlCode: "P1" });
  });

  it("is empty for a product that is gone", () => {
    expect(orderLineIds(undefined)).toEqual({ mtrl: null, xmlCode: null });
  });
});

describe("xmlOnlyPimError", () => {
  it("refuses a PIM write for an XML-only product, in the actions' error shape", () => {
    expect(xmlOnlyPimError(-3)).toEqual({
      ok: false,
      error: "Προϊόν μόνο-XML: επεξεργασία στο HDCtool → Milwaukee XML",
    });
  });

  it("lets ERP products through", () => {
    expect(xmlOnlyPimError(812)).toBeNull();
  });
});
