import { describe, expect, it } from "vitest";
import { DEALER_WORDING, DEFAULT_SUMMARY_EL, greekSummary, groupModels, llmsFullTxt, llmsTxt } from "@/lib/seo/llms";
import { brandFaq, categoryFaq } from "@/lib/seo/category-copy";
import { SHOP } from "@/config/shop";
import { DEFAULT_VAT_RATE } from "@/lib/format";

/**
 * llms.txt is what a language model quotes when asked "where do I buy
 * Milwaukee in Piraeus". It was the Kolleris file — a multi-brand shop calling
 * itself an official distributor. The HDC is a Milwaukee store run by
 * ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ, and it makes no claim of representing the manufacturer.
 */
const ORIGIN = "https://milwaukeetoolshdc.gr";

describe("llmsTxt", () => {
  const body = llmsTxt(ORIGIN);

  it("names the HDC store, not Kolleris", () => {
    expect(body.startsWith(`# ${SHOP.name}`)).toBe(true);
    expect(body).not.toMatch(/^# Kolleris/m);
  });

  it("names the operating company exactly once", () => {
    expect(body.split(SHOP.operator.name).length - 1).toBe(1);
  });

  it("makes no dealer or distributor claim", () => {
    expect(body).not.toMatch(DEALER_WORDING);
  });

  it("lists only Milwaukee, never the Kolleris brands", () => {
    for (const other of ["FACOM", "GEDORE", "WERA", "KNIPEX", "BAHCO", "FESTOOL"]) {
      expect(body).not.toContain(other);
    }
    for (const line of ["M12", "M18", "MX FUEL", "PACKOUT"]) expect(body).toContain(line);
  });

  it("carries the store's NAP and hours from SHOP", () => {
    expect(body).toContain(SHOP.contact.street);
    expect(body).toContain(SHOP.contact.postcode);
    expect(body).toContain(SHOP.contact.phones[0].display);
    expect(body).toContain(SHOP.contact.email);
    expect(body).toContain(SHOP.contact.hours.weekdays.open);
    expect(body).toContain(SHOP.contact.hours.saturday.close);
  });

  it("states the VAT rate the prices are computed with", () => {
    expect(body).toContain(`VAT (${DEFAULT_VAT_RATE}%)`);
  });

  it("explains the three availability states", () => {
    expect(body).toMatch(/in stock/i);
    expect(body).toContain("3-5 working days");
    expect(body).toContain("1-3 working days");
  });

  it("points only at the Greek site, never at /en or /it", () => {
    expect(body).not.toContain(`${ORIGIN}/en`);
    expect(body).not.toContain(`${ORIGIN}/it`);
  });

  it("links the main pages on the given origin", () => {
    for (const path of ["/katalogos", "/epikoinonia", "/oroi-chrisis", "/syxnes-erotiseis", "/llms-full.txt"]) {
      expect(body).toContain(`${ORIGIN}${path}`);
    }
  });
});

describe("llmsTxt: Greek first", () => {
  it("opens with the Greek summary, then a Greek section, then English", () => {
    const body = llmsTxt(ORIGIN);
    const lines = body.split("\n");
    expect(lines[2].startsWith("> Το ")).toBe(true);
    expect(body.indexOf("## Στα ελληνικά")).toBeLessThan(body.indexOf("## In English"));
    expect(body).toContain(`${ORIGIN}/odigoi`);
  });

  it("uses the admin's summary when it is set", () => {
    const body = llmsTxt(ORIGIN, { summaryEl: "Εργαλεία Milwaukee στον Πειραιά. Παραλαβή ή αποστολή." });
    expect(body).toContain("> Εργαλεία Milwaukee στον Πειραιά.\n> Παραλαβή ή αποστολή.");
    expect(body).not.toContain(DEFAULT_SUMMARY_EL);
  });

  it("never lets a setting put a dealer claim into the file", () => {
    expect(greekSummary("Επίσημος αντιπρόσωπος Milwaukee στην Ελλάδα.")).toBe(DEFAULT_SUMMARY_EL);
    expect(greekSummary("   ")).toBe(DEFAULT_SUMMARY_EL);
    expect(DEFAULT_SUMMARY_EL).not.toMatch(DEALER_WORDING);
  });
});

describe("llmsFullTxt", () => {
  const body = llmsFullTxt(ORIGIN, [
    {
      platform: "M18",
      models: [
        {
          root: "M18 FPD3",
          name: "Κρουστικό δράπανο M18 FUEL",
          versions: [
            { code: "M18 FPD3-0X", code2: "4933479859", slug: "m18-fpd3-0x" },
            { code: "M18 FPD3-502X", code2: "4933479860", slug: "m18-fpd3-502x" },
          ],
        },
      ],
    },
  ]);

  it("lists every version with its article number and page", () => {
    expect(body).toContain("M18 FPD3");
    expect(body).toContain("M18 FPD3-502X");
    expect(body).toContain("4933479860");
    expect(body).toContain(`${ORIGIN}/proion/m18-fpd3-502x`);
  });

  it("names only the platforms it actually lists", () => {
    const header = body.split("\n").slice(0, 5).join("\n");
    expect(header).toContain("M18");
    expect(header).not.toContain("MX FUEL");
    expect(header).not.toContain("M12");
  });

  it("makes no dealer claim either", () => {
    expect(body).not.toMatch(DEALER_WORDING);
  });
});

describe("category and brand FAQ copy", () => {
  it("never claims to be a dealer or distributor", () => {
    const brand = brandFaq({ name: "Milwaukee", total: 100, inStock: 40, categories: ["Δράπανα", "Μπαταρίες"] });
    const category = categoryFaq({
      name: "Δράπανα",
      total: 40,
      facets: {
        availability: [{ slug: "in-stock", count: 10 }],
        priceBounds: { min: 10, max: 400 },
        subcategories: [],
        brands: [
          { label: "Milwaukee", count: 30 },
          { label: "Other", count: 10 },
        ],
      },
    } as unknown as Parameters<typeof categoryFaq>[0]);
    for (const pair of [...brand, ...category]) {
      expect(pair.q).not.toMatch(DEALER_WORDING);
      expect(pair.a).not.toMatch(DEALER_WORDING);
    }
  });
});

describe("groupModels", () => {
  const rows = [
    { name: "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟ M18 FPD3-502X 4933479860 MILWAUKEE", code2: "4933479860", slug: "b", platform: "M18", modelRoot: "M18 FPD3", modelContent: "kit" },
    { name: "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟ M18 FPD3-0X 4933479859 MILWAUKEE", code2: "4933479859", slug: "a", platform: "M18", modelRoot: "M18 FPD3", modelContent: "bare" },
    { name: "ΚΑΤΣΑΒΙΔΙ M12 FID2-0 4933479876", code2: "4933479876", slug: "c", platform: "M12", modelRoot: "M12 FID2", modelContent: "bare" },
    { name: "ΜΠΑΤΑΡΙΑ M18 B5", code2: "4932430483", slug: "d", platform: "M18", modelRoot: null, modelContent: null },
    { name: "ΚΑΡΟΤΙΕΡΑ MXF DCD150-302C KIT 4933471835", code2: "4933471835", slug: "e", platform: "MX", modelRoot: "MXF DCD150", modelContent: "kit" },
  ];
  const grouped = groupModels(rows);

  it("groups versions by platform and model, bare first", () => {
    expect(grouped.map((p) => p.platform)).toEqual(["M18", "M12", "MX"]);
    const fpd3 = grouped[0].models[0];
    expect(fpd3.root).toBe("M18 FPD3");
    expect(fpd3.versions.map((v) => v.code)).toEqual(["M18 FPD3-0X", "M18 FPD3-502X"]);
  });

  it("names the model by what the tool is, without codes or brand", () => {
    expect(grouped[0].models[0].name).toBe("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟ");
    expect(grouped[2].models[0]).toMatchObject({ root: "MXF DCD150", versions: [{ code: "MXF DCD150-302C" }] });
  });

  it("reads the model from the name when the stored root is not filled yet", () => {
    const [mx] = groupModels([
      { name: "ΚΟΦΤΗΣ 350mm MXF COS350G2-802 4933480480", code2: "4933480480", slug: "f", platform: "MX", modelRoot: null, modelContent: null },
    ]);
    expect(mx).toMatchObject({ platform: "MX", models: [{ root: "MXF COS350G2" }] });
  });

  it("leaves out products that are not a model", () => {
    expect(grouped.flatMap((p) => p.models).map((m) => m.root)).not.toContain(null);
    expect(grouped.flatMap((p) => p.models)).toHaveLength(3);
  });
});
