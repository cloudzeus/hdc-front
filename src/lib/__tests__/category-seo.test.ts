import { describe, expect, it } from "vitest";
import { accentedName, categoryDescription, categoryTitle } from "@/lib/seo/category-seo";

describe("accentedName", () => {
  it("spells the ERP capitals with the accents the products use", () => {
    expect(accentedName("ΚΡΟΥΣΤΙΚΑ ΔΡΑΠΑΝΑ", ["Τα κρουστικά δράπανα της Milwaukee."])).toBe("Κρουστικά δράπανα");
  });

  it("keeps the capitals when a word cannot be spelt", () => {
    expect(accentedName("ΚΡΟΥΣΤΙΚΑ ΔΡΑΠΑΝΑ", ["Κρουστικά εργαλεία."])).toBe("ΚΡΟΥΣΤΙΚΑ ΔΡΑΠΑΝΑ");
  });
});

describe("categoryTitle", () => {
  it("names the brand and the platforms", () => {
    expect(categoryTitle({ name: "Κρουστικά δράπανα", platforms: ["M12", "M18"] })).toBe("Κρουστικά δράπανα Milwaukee M12 & M18");
    expect(categoryTitle({ name: "Κατσαβίδια", platforms: [] })).toBe("Κατσαβίδια Milwaukee");
  });

  it("drops the platforms rather than run long", () => {
    const title = categoryTitle({ name: "Γωνιακοί τροχοί, λειαντήρες μπετού και φρέζες για κάθε δουλειά", platforms: ["M12", "M18"] });
    expect(title.endsWith("Milwaukee")).toBe(true);
  });
});

describe("categoryDescription", () => {
  it("is specific to the category and within 155 characters", () => {
    const d = categoryDescription({
      name: "Κρουστικά δράπανα",
      total: 24,
      platforms: ["M12", "M18"],
      children: ["Δράπανα μπαταρίας", "Δράπανα ρεύματος"],
    });
    expect(d).toContain("Κρουστικά δράπανα Milwaukee για M12 & M18: 24 κωδικοί");
    expect(d).toContain("Πειραιά");
    expect(d.length).toBeLessThanOrEqual(155);
  });

  it("quotes a name that kept its capitals", () => {
    expect(categoryDescription({ name: "ΚΑΤΣΑΒΙΔΙΑ", total: 96, platforms: [], children: [] })).toMatch(/^«ΚΑΤΣΑΒΙΔΙΑ» Milwaukee: 96 κωδικοί\./);
  });
});

describe("accentedName with a lexicon", () => {
  it("falls back to the store's own words when the products do not use one", () => {
    expect(accentedName("ΦΑΚΟΙ ΕΠΑΝΑΦΟΡΤΙΖΟΜΕΝΟΙ", [], { φακοι: "φακοί", επαναφορτιζομενοι: "επαναφορτιζόμενοι" })).toBe(
      "Φακοί επαναφορτιζόμενοι",
    );
  });
});
