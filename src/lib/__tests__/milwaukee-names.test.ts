import { describe, expect, it } from "vitest";
import { milwaukeeKey, milwaukeeNameIndex, withMilwaukeeNames } from "@/lib/sync/milwaukee-names";
import type { HdctoolMilwaukeeCategory } from "@/lib/hdctool/client";

const node = (
  erpType: HdctoolMilwaukeeCategory["erpType"],
  erpCode: string,
  en: string,
  it: string,
  children: HdctoolMilwaukeeCategory[] = [],
): HdctoolMilwaukeeCategory => ({
  id: `${erpType}-${erpCode}`,
  parentId: null,
  erpType,
  erpCode,
  name: { el: "—", en, it },
  order: 0,
  mainImage: null,
  children,
});

describe("Milwaukee category names", () => {
  const index = milwaukeeNameIndex([
    node("CATEGORY", "12", "Transport – Storage", "Trasporto – Stoccaggio", [
      node("GROUP", "3901", "Toolboxes – Organisers – Storage Boxes", "Cassette portautensili – Organizer – Contenitori"),
    ]),
  ]);

  it("indexes nested nodes by type and code", () => {
    expect(index.get(milwaukeeKey("GROUP", "3901"))?.en).toBe("Toolboxes – Organisers – Storage Boxes");
    expect(index.has(milwaukeeKey("SUBGROUP", "3901"))).toBe(false);
  });

  it("replaces the feed's Greek copies with the tree's translations", () => {
    const greek = "ΕΡΓΑΛΕΙΟΘΗΚΕΣ-ΣΚΑΦΑΚΙΑ-ΚΟΥΤΙΑ ΑΠΟΘΗΚΕΥΣΗΣ";
    expect(withMilwaukeeNames({ en: greek, it: greek }, index.get("GROUP:3901"))).toEqual({
      en: "Toolboxes – Organisers – Storage Boxes",
      it: "Cassette portautensili – Organizer – Contenitori",
    });
  });

  it("keeps the feed's names when the tree has none, or only Greek", () => {
    const base = { en: "Drilling", it: "Foratura" };
    expect(withMilwaukeeNames(base, undefined)).toEqual(base);
    expect(withMilwaukeeNames(base, { en: "ΔΙΑΤΡΗΣΗ", it: "" })).toEqual(base);
  });

  it("accepts the diameter sign as a translation", () => {
    expect(withMilwaukeeNames({ en: "Φ125", it: "Φ125" }, { en: "Ø125", it: "Φ125" })).toEqual({
      en: "Ø125",
      it: "Φ125",
    });
  });
});
