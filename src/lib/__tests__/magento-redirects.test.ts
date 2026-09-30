import { describe, expect, it } from "vitest";
import {
  buildMagentoTable,
  categorySkeleton,
  createMagentoResolver,
  isMagentoCandidate,
  normaliseCode,
} from "@/lib/seo/magento-redirects";

/**
 * The old milwaukeetoolshdc.gr — a headless storefront over Magento — used
 * these shapes (read off its own pages):
 *
 *   product    /mpataria-18v-5-0ah-m18-b5-4932430483   (name slug + SKU)
 *   category   /category-12-ergaleia-mpatarias          (Magento id + name slug)
 *   page       /terms-and-conditions, /shipment-delivery, /track-order …
 *
 * and classic Magento adds `*.html`, `/customer/*`, `/checkout/cart`,
 * `/catalogsearch/result?q=`. The new shop lives on the same domain, so each of
 * these must land somewhere real with a 301 — never on a 404.
 */

const table = buildMagentoTable({
  products: [
    { code: "20473532039", code1: "4002395381449", code2: "4932430483", slug: "bataria-18v-5-0ah-m18-b5-4932430483-4932430483" },
    { code: "21191000004", code1: "045242342402", code2: "48227314", slug: "tileskopikos-solinokavouras-24-48227314-48227314" },
    { code: "21191000961", code1: "4058546369972", code2: "4933479203", slug: "laser-m12-cll4p-301c-4933479203-4933479203" },
    // The same article twice: the ERP row (mtrl > 0) and its XML-only twin. Same
    // product, so the ERP row wins rather than neither.
    { code: "E-1", code1: "", code2: "4932493104", slug: "kapelo-erp", mtrl: 50123 },
    { code: "E-2", code1: "", code2: "4932493104 ", slug: "kapelo-xml", mtrl: -17 },
    // Two products sharing a normalised code: ambiguous, so neither is mapped by it.
    { code: "X-1", code1: "", code2: "11-22-33", slug: "first" },
    { code: "X-2", code1: "", code2: "112233", slug: "second" },
  ],
  categories: [
    { slug: "ergaleia-batarias", nameEl: "ΕΡΓΑΛΕΙΑ ΜΠΑΤΑΡΙΑΣ", productCount: 409 },
    { slug: "ergaleia-cheiros", nameEl: "ΕΡΓΑΛΕΙΑ ΧΕΙΡΟΣ", productCount: 528, level: 0 },
    // The same name as a group lower down: the top-level category wins.
    { slug: "ergaleia-cheiros-2", nameEl: "ΕΡΓΑΛΕΙΑ ΧΕΙΡΟΣ", productCount: 40, level: 1 },
    { slug: "exartimata-ilektrikon-ergaleion-kai-batarias", nameEl: "ΕΞΑΡΤΗΜΑΤΑ ΗΛΕΚΤΡΙΚΩΝ ΕΡΓΑΛΕΙΩΝ ΚΑΙ ΜΠΑΤΑΡΙΑΣ", productCount: 432 },
    { slug: "metafora-apothikeysi-thesi-ergasias", nameEl: "ΜΕΤΑΦΟΡΑ - ΑΠΟΘΗΚΕΥΣΗ - ΘΕΣΗ ΕΡΓΑΣΙΑΣ", productCount: 163 },
    // Same name under two parents: ambiguous.
    { slug: "diafora", nameEl: "ΔΙΑΦΟΡΑ", productCount: 10, level: 2 },
    { slug: "diafora-2", nameEl: "ΔΙΑΦΟΡΑ", productCount: 12, level: 2 },
  ],
});
const resolve = createMagentoResolver(table);

describe("normaliseCode", () => {
  it("strips spaces and dashes and ignores case", () => {
    expect(normaliseCode("48-22-7314")).toBe("48227314");
    expect(normaliseCode(" m18 FPD3 ")).toBe("M18FPD3");
  });
});

describe("categorySkeleton", () => {
  it("reads the old and the new transliteration as the same name", () => {
    // Old: β→b, μπ→mp, ου→oy. New: β→v, μπ→b, ου→ou.
    expect(categorySkeleton("ergaleia-mpatarias")).toBe(categorySkeleton("ergaleia-batarias"));
    expect(categorySkeleton("tileskopikos-solinokaboyras")).toBe(categorySkeleton("tileskopikos-solinokavouras"));
  });
});

describe("isMagentoCandidate", () => {
  it("takes the old shapes", () => {
    for (const path of [
      "/mpataria-18v-5-0ah-m18-b5-4932430483",
      "/category-12-ergaleia-mpatarias",
      "/terms-and-conditions",
      "/ergaleia/drapana.html",
      "/customer/account/login/",
      "/checkout/cart/",
      "/catalogsearch/result/",
    ]) {
      expect(isMagentoCandidate(path), path).toBe(true);
    }
  });

  it("leaves every route of the new shop alone", () => {
    for (const path of [
      "/",
      "/katalogos",
      "/katalogos/ergaleia-batarias",
      "/proion/bataria-18v-5-0ah-m18-b5-4932430483-4932430483",
      "/anazitisi",
      "/checkout",
      "/checkout/epibebaiosi/HDC-20260930-0001",
      "/logariasmos/paraggelies/HDC-20260930-0001",
      "/en/katalogos",
      "/it",
      "/admin/products",
      "/eisodos",
    ]) {
      expect(isMagentoCandidate(path), path).toBe(false);
    }
  });

  it("does not swallow a search-engine verification file", () => {
    expect(isMagentoCandidate("/google1234abcd5678ef90.html")).toBe(false);
  });
});

describe("resolver: products", () => {
  it("finds a product by the SKU at the end of the old URL", () => {
    expect(resolve("/mpataria-18v-5-0ah-m18-b5-4932430483", "")).toEqual({
      to: "/proion/bataria-18v-5-0ah-m18-b5-4932430483-4932430483",
      kind: "product",
    });
    expect(resolve("/tileskopikos-solinokaboyras-24-48227314", "")?.to).toBe(
      "/proion/tileskopikos-solinokavouras-24-48227314-48227314",
    );
  });

  it("finds it when the SKU kept its dashes or the URL ends in .html", () => {
    expect(resolve("/tileskopikos-solinokaboyras-48-22-7314.html", "")?.kind).toBe("product");
    expect(resolve("/laser-m12-cll4p-301c-4933479203.html", "")?.to).toBe(
      "/proion/laser-m12-cll4p-301c-4933479203-4933479203",
    );
  });

  it("matches the EAN and the ERP code too", () => {
    expect(resolve("/some-name-4002395381449", "")?.kind).toBe("product");
    expect(resolve("/some-name-20473532039", "")?.kind).toBe("product");
  });

  it("prefers the ERP row when one article is listed twice", () => {
    expect(resolve("/kapelo-bcpdgr-dark-grey-l-xl-4932493104", "")?.to).toBe("/proion/kapelo-erp");
  });

  it("does not guess between two products with the same code", () => {
    expect(table.ambiguous.codes).toContain("112233");
    expect(resolve("/thing-112233", "")).toEqual({ to: "/anazitisi?q=112233", kind: "search" });
  });

  it("sends an unknown SKU to the search for it, not to a 404", () => {
    expect(resolve("/old-tool-4933000000", "")).toEqual({ to: "/anazitisi?q=4933000000", kind: "search" });
  });
});

describe("resolver: categories", () => {
  it("maps the old category by its name", () => {
    expect(resolve("/category-12-ergaleia-mpatarias", "")).toEqual({
      to: "/katalogos/ergaleia-batarias",
      kind: "category",
    });
    expect(resolve("/category-35-exartimata-ilektrikon-ergaleion-kai-mpatarias", "")?.to).toBe(
      "/katalogos/exartimata-ilektrikon-ergaleion-kai-batarias",
    );
    expect(resolve("/category-18-metafora-apothikeysi-thesi-ergasias/", "")?.to).toBe(
      "/katalogos/metafora-apothikeysi-thesi-ergasias",
    );
  });

  it("prefers the top-level category when a group has the same name", () => {
    expect(resolve("/category-10-ergaleia-cheiros", "")?.to).toBe("/katalogos/ergaleia-cheiros");
  });

  it("maps a classic Magento category path by its last segment", () => {
    expect(resolve("/ergaleia/ergaleia-cheiros.html", "")?.to).toBe("/katalogos/ergaleia-cheiros");
  });

  it("searches when the category is unknown or ambiguous", () => {
    expect(resolve("/category-99-kati-allo", "")).toEqual({ to: "/anazitisi?q=kati%20allo", kind: "search" });
    expect(table.ambiguous.categories).toContain(categorySkeleton("diafora"));
    expect(resolve("/category-7-diafora", "")?.kind).toBe("search");
  });
});

describe("resolver: pages and Magento routes", () => {
  it("maps the old pages to the new ones", () => {
    expect(resolve("/terms-and-conditions", "")?.to).toBe("/oroi-chrisis");
    expect(resolve("/shipment-delivery/", "")?.to).toBe("/apostoli-paradosi");
    expect(resolve("/track-order", "")?.to).toBe("/logariasmos/entopismos");
    expect(resolve("/contact-us", "")?.to).toBe("/epikoinonia");
    expect(resolve("/about-us", "")?.to).toBe("/etaireia");
    expect(resolve("/payment-methods", "")?.to).toBe("/tropoi-pliromis");
    expect(resolve("/new-products", "")?.to).toBe("/nees-afixeis");
    expect(resolve("/category-listing", "")?.to).toBe("/katalogos");
  });

  it("maps the Magento account, cart and search routes", () => {
    expect(resolve("/customer/account/login/", "")?.to).toBe("/eisodos");
    expect(resolve("/customer/account/create", "")?.to).toBe("/eggrafi");
    expect(resolve("/customer/account/", "")?.to).toBe("/logariasmos");
    expect(resolve("/checkout/cart/", "")?.to).toBe("/kalathi");
    expect(resolve("/catalogsearch/result/", "?q=m18%20fpd3")?.to).toBe("/anazitisi?q=m18%20fpd3");
    expect(resolve("/catalogsearch/result/", "")?.to).toBe("/anazitisi");
  });

  it("sends any other old .html page to the search for its name", () => {
    expect(resolve("/some/old-page-name.html", "")).toEqual({ to: "/anazitisi?q=old%20page%20name", kind: "search" });
  });

  it("returns nothing for a path of the new shop", () => {
    expect(resolve("/katalogos/ergaleia-batarias", "")).toBeNull();
  });
});
