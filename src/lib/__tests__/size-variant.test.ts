import { describe, expect, it } from "vitest";
import { sizeFamilyLd, sizedText } from "@/lib/seo/size-variant";

/**
 * A boot, a glove, a jacket: one product in several sizes, each size its own
 * code and its own page. Each page must say which size and which code it is —
 * someone searching «4932498126» wants the 43, not "the boot" — and the pages
 * must be declared as one family so Google does not read them as duplicates.
 */
const url = (slug: string) => `https://milwaukeetoolshdc.gr/proion/${slug}`;
const sizes = [
  { slug: "boot-42", label: "42", code: "4932498125", current: false },
  { slug: "boot-43", label: "43", code: "4932498126", current: true },
  { slug: "boot-44", label: "44", code: "4932498127", current: false },
];
const sizeCode = (size: string, code: string) => `Μέγεθος ${size} · κωδικός ${code}`;

describe("sizedText", () => {
  it("adds the size and the code to a size variant's name", () => {
    expect(sizedText("FLEXTRED ΜΠΟΤΑΚΙ ΑΣΦΑΛΕΙΑΣ", sizes, sizeCode)).toBe(
      "FLEXTRED ΜΠΟΤΑΚΙ ΑΣΦΑΛΕΙΑΣ · Μέγεθος 43 · κωδικός 4932498126",
    );
  });

  it("leaves a product without sizes as it is", () => {
    expect(sizedText("M18 FPD3 ΔΡΑΠΑΝΟ", [], sizeCode)).toBe("M18 FPD3 ΔΡΑΠΑΝΟ");
  });

  it("returns the size part alone when asked", () => {
    expect(sizedText(null, sizes, sizeCode)).toBe("Μέγεθος 43 · κωδικός 4932498126");
    expect(sizedText(null, [], sizeCode)).toBeNull();
  });
});

describe("sizeFamilyLd", () => {
  const ld = sizeFamilyLd({ groupId: "FLEXTRED-BOA-S3S", name: "FLEXTRED ΜΠΟΤΑΚΙ ΑΣΦΑΛΕΙΑΣ", sizes, url, sizeCode })!;

  it("declares the family as a ProductGroup varying by size", () => {
    expect(ld.group["@type"]).toBe("ProductGroup");
    expect(ld.group.productGroupID).toBe("FLEXTRED-BOA-S3S");
    expect(ld.group.variesBy).toBe("https://schema.org/size");
    expect(ld.group.brand).toEqual({ "@type": "Brand", name: "Milwaukee" });
  });

  it("lists every size with its code, page and name", () => {
    expect(ld.group.hasVariant).toHaveLength(3);
    expect(ld.group.hasVariant[1]).toEqual({
      "@type": "Product",
      "@id": `${url("boot-43")}#product`,
      name: "FLEXTRED ΜΠΟΤΑΚΙ ΑΣΦΑΛΕΙΑΣ · Μέγεθος 43 · κωδικός 4932498126",
      sku: "4932498126",
      mpn: "4932498126",
      size: "43",
      url: url("boot-43"),
    });
  });

  it("has the same id on every member's page", () => {
    const fromAnother = sizeFamilyLd({
      groupId: "FLEXTRED-BOA-S3S",
      name: "FLEXTRED ΜΠΟΤΑΚΙ ΑΣΦΑΛΕΙΑΣ",
      sizes: sizes.map((s) => ({ ...s, current: s.slug === "boot-44" })),
      url,
      sizeCode,
    })!;
    expect(fromAnother.group["@id"]).toBe(ld.group["@id"]);
  });

  it("ties the page's own Product to the group", () => {
    expect(ld.product).toEqual({
      "@id": `${url("boot-43")}#product`,
      size: "43",
      inProductGroupWithID: "FLEXTRED-BOA-S3S",
      isVariantOf: { "@id": ld.group["@id"] },
    });
  });

  it("is Greek-only: nothing on an en/it page", () => {
    expect(sizeFamilyLd({ groupId: "G", name: "x", sizes, url, sizeCode, locale: "en" })).toBeNull();
    expect(sizeFamilyLd({ groupId: "G", name: "x", sizes, url, sizeCode, locale: "el" })).not.toBeNull();
  });

  it("is nothing for a product outside a size family", () => {
    expect(sizeFamilyLd({ groupId: null, name: "x", sizes, url, sizeCode })).toBeNull();
    expect(sizeFamilyLd({ groupId: "G", name: "x", sizes: sizes.slice(0, 1), url, sizeCode })).toBeNull();
  });
});
