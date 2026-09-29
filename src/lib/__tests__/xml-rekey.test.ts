import { describe, expect, it } from "vitest";
import { planXmlRekey } from "@/lib/sync/xml-rekey";

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
});
