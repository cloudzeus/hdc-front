import { describe, expect, it } from "vitest";
import { clampDescription, sizeFamilyLd, sizedText, sizeTitleEl } from "@/lib/seo/size-variant";

/**
 * A boot, a glove, a jacket: one product in several sizes, each size its own
 * code and its own page. Each page must say which size and which code it is —
 * someone searching «4932498126» wants the 43, not "the boot" — and the pages
 * must be declared as one family so Google does not read them as duplicates.
 */
const url = (slug: string) => `https://milwaukeetoolshdc.gr/proion/${slug}`;
const ORIGIN = "https://milwaukeetoolshdc.gr";
const sizes = [
  { slug: "boot-42", label: "42", code: "4932498125", code2: "4932498125", current: false },
  { slug: "boot-43", label: "43", code: "4932498126", code2: "4932498126", current: true },
  // An item without a manufacturer code: its ERP code is the sku, and no mpn.
  { slug: "boot-44", label: "44", code: "21191000009", code2: "", current: false },
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
  const ld = sizeFamilyLd({ groupId: "FLEXTRED-BOA-S3S", name: "FLEXTRED ΜΠΟΤΑΚΙ ΑΣΦΑΛΕΙΑΣ", sizes, url, sizeCode, origin: ORIGIN })!;

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
      origin: ORIGIN,
    })!;
    expect(fromAnother.group["@id"]).toBe(ld.group["@id"]);
  });

  it("builds the group id from the variant group, not from a member page", () => {
    expect(ld.group["@id"]).toBe(`${ORIGIN}/#productgroup-flextred-boa-s3s`);
  });

  it("gives an mpn only where there is a manufacturer code", () => {
    expect(ld.group.hasVariant[2]).toMatchObject({ sku: "21191000009", size: "44" });
    expect(ld.group.hasVariant[2]).not.toHaveProperty("mpn");
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
    expect(sizeFamilyLd({ groupId: "G", name: "x", sizes, url, sizeCode, origin: ORIGIN, locale: "en" })).toBeNull();
    expect(sizeFamilyLd({ groupId: "G", name: "x", sizes, url, sizeCode, origin: ORIGIN, locale: "el" })).not.toBeNull();
  });

  it("is nothing for a product outside a size family", () => {
    expect(sizeFamilyLd({ groupId: null, name: "x", sizes, url, sizeCode, origin: ORIGIN })).toBeNull();
    expect(sizeFamilyLd({ groupId: "G", name: "x", sizes: sizes.slice(0, 1), url, sizeCode, origin: ORIGIN })).toBeNull();
  });
});

describe("sizeTitleEl", () => {
  const site = "Milwaukee Heavy Duty Centre";

  it("keeps size and code and fits about 60 characters, dropping the site name", () => {
    const t = sizeTitleEl({ name: "FLEXTRED NUBUCK BOA S3S ΜΠΟΤΑΚΙ ΑΣΦΑΛΕΙΑΣ B1M110133", size: "43", code: "4932498126", siteName: site });
    expect(t).toEqual({ title: "FLEXTRED NUBUCK BOA S3S ΜΠΟΤΑΚΙ ΑΣΦΑΛΕΙΑΣ Νο 43 · 4932498126", absolute: true });
    expect(t.title.length).toBeLessThanOrEqual(60);
  });

  it("keeps the site name when everything fits", () => {
    expect(sizeTitleEl({ name: "ΚΑΠΕΛΟ", size: "L/XL", code: "4932493104", siteName: site })).toEqual({
      title: "ΚΑΠΕΛΟ L/XL · 4932493104",
      absolute: false,
    });
  });

  it("writes Νο only before a numeric size", () => {
    expect(sizeTitleEl({ name: "ΓΑΝΤΙΑ", size: "9/L", code: "4932471902", siteName: site }).title).toBe("ΓΑΝΤΙΑ 9/L · 4932471902");
    expect(sizeTitleEl({ name: "ΜΠΟΤΑ", size: "42", code: "1", siteName: site }).title).toBe("ΜΠΟΤΑ Νο 42 · 1");
  });
});

describe("clampDescription", () => {
  it("leaves a short description alone", () => {
    expect(clampDescription("Μέγεθος 43, κωδικός 4932498126.")).toBe("Μέγεθος 43, κωδικός 4932498126.");
  });

  it("cuts at a word under 155 characters with an ellipsis", () => {
    const long = "λέξη ".repeat(60).trim();
    const out = clampDescription(long);
    expect(out.length).toBeLessThanOrEqual(155);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });
});
