import { describe, expect, it } from "vitest";
import { isXmlCodeClash, planXmlRekey } from "@/lib/sync/xml-rekey";

describe("planXmlRekey", () => {
  it("moves an XML row onto its new MTRL", () => {
    expect(
      planXmlRekey([{ mtrl: 812, xmlCode: "P1" }], [{ id: "row1", mtrl: -3, xmlCode: "P1" }], new Set())
    ).toEqual([{ kind: "move", id: "row1", to: 812 }]);
  });

  it("retires the XML row when the MTRL already has its own row", () => {
    expect(
      planXmlRekey([{ mtrl: 812, xmlCode: "P1" }], [{ id: "row1", mtrl: -3, xmlCode: "P1" }], new Set([812]))
    ).toEqual([{ kind: "retire", id: "row1" }]);
  });

  it("ignores XML items themselves, rows already on a real MTRL, and products without xmlCode", () => {
    expect(
      planXmlRekey(
        [{ mtrl: -3, xmlCode: "P1" }, { mtrl: 900, xmlCode: null }, { mtrl: 812, xmlCode: "P2" }],
        [{ id: "row1", mtrl: -3, xmlCode: "P1" }, { id: "row2", mtrl: 812, xmlCode: "P2" }],
        new Set([812])
      )
    ).toEqual([]);
  });

  it("uses an XML row once, even if two incoming products claim its code", () => {
    expect(
      planXmlRekey(
        [{ mtrl: 812, xmlCode: "P1" }, { mtrl: 813, xmlCode: "P1" }],
        [{ id: "row1", mtrl: -3, xmlCode: "P1" }],
        new Set()
      )
    ).toEqual([{ kind: "move", id: "row1", to: 812 }]);
  });

  it("releases an ERP row's code when an XML-only product arrives with it (HDCtool is the authority)", () => {
    expect(
      planXmlRekey([{ mtrl: -5, xmlCode: "P1" }], [{ id: "row1", mtrl: 812, xmlCode: "P1" }], new Set())
    ).toEqual([{ kind: "release", id: "row1" }]);
  });

  it("releases the old ERP row's code when HDCtool re-links it to another MTRL", () => {
    expect(
      planXmlRekey([{ mtrl: 900, xmlCode: "P1" }], [{ id: "row1", mtrl: 812, xmlCode: "P1" }], new Set([900]))
    ).toEqual([{ kind: "release", id: "row1" }]);
  });

  it("releases the old XML row's code when the item comes back under a new feed sequence", () => {
    expect(
      planXmlRekey([{ mtrl: -5, xmlCode: "P1" }], [{ id: "row1", mtrl: -3, xmlCode: "P1" }], new Set())
    ).toEqual([{ kind: "release", id: "row1" }]);
  });
});

describe("isXmlCodeClash", () => {
  const clash = {
    code: "P2002",
    meta: {
      modelName: "Product",
      driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { fields: ['"xmlCode"'] } } },
    },
  };

  it("recognises the unique violation on products.xmlCode, as the pg adapter reports it", () => {
    expect(isXmlCodeClash(clash)).toBe(true);
  });

  it("ignores other unique violations and other errors", () => {
    const slug = { code: "P2002", meta: { driverAdapterError: { cause: { constraint: { fields: ['"slug"'] } } } } };
    expect(isXmlCodeClash(slug)).toBe(false);
    expect(isXmlCodeClash(new Error("xmlCode"))).toBe(false);
    expect(isXmlCodeClash(null)).toBe(false);
  });
});
