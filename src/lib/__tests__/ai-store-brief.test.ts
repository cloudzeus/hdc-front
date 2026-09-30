import { describe, expect, it } from "vitest";
import { NEVER_DEALER, STORE_BRIEF } from "@/lib/ai/store-brief";

describe("AI store brief", () => {
  it("describes the HDC store from the shop config", () => {
    expect(STORE_BRIEF).toContain("Milwaukee Heavy Duty Centre: κατάστημα εργαλείων Milwaukee στον Πειραιά");
    expect(STORE_BRIEF).toContain("Κ. Μαυρομιχάλη 4, 185 45");
    expect(STORE_BRIEF).toContain("Πουλά μόνο Milwaukee");
    expect(STORE_BRIEF).toContain("Εταιρεία: ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ.");
    expect(STORE_BRIEF).not.toMatch(/Kolleris|1978/);
  });
  it("forbids the dealer wording", () => {
    expect(NEVER_DEALER).toBe("Μη γράφεις ποτέ \"εξουσιοδοτημένος αντιπρόσωπος\".");
  });
});
