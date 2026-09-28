import { describe, expect, it } from "vitest";
import { displayName, platformTag } from "@/lib/milwaukee/display";

describe("displayName", () => {
  it("drops the article number and the brand from the end", () => {
    expect(
      displayName("ΕΡΓΑΛΕΙΟ ΑΥΛΑΚΩΣΗΣ ΣΩΛΗΝΩΝ M18 FRGRO114-0C 4933479788 MILWAUKEE", "4933479788"),
    ).toBe("ΕΡΓΑΛΕΙΟ ΑΥΛΑΚΩΣΗΣ ΣΩΛΗΝΩΝ M18 FRGRO114-0C");
    expect(displayName("ΜΠΑΤΑΡΙΑ 18V 5.0AH M18 B5 4932430483", "4932430483")).toBe(
      "ΜΠΑΤΑΡΙΑ 18V 5.0AH M18 B5",
    );
  });

  it("collapses spaces and splits a platform glued to its model", () => {
    expect(
      displayName("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ  M18FPD3-502X FUEL 4933479860", "4933479860"),
    ).toBe("ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-502X FUEL");
  });

  it("writes a Greek Μ in front of 12/18 as a Latin M", () => {
    expect(displayName("ΤΡΟΧΟΣ ΓΩΝΙΑΚΟΣ Μ12 FCOT-0 FUEL 4933464618", "4933464618")).toBe(
      "ΤΡΟΧΟΣ ΓΩΝΙΑΚΟΣ M12 FCOT-0 FUEL",
    );
  });

  it("removes a trailing article number even without the code", () => {
    expect(displayName("ΥΔΡΑΥΛΙΚΗ ΠΡΕΣΣΑ M18 ONEHCCT60-0C  4933479683")).toBe(
      "ΥΔΡΑΥΛΙΚΗ ΠΡΕΣΣΑ M18 ONEHCCT60-0C",
    );
  });

  it("removes the code from the middle and the brand in any case", () => {
    expect(
      displayName(
        "Batteria Milwaukee M18 B5 4932430483 18V 5.0Ah REDLITHIUM agli ioni di litio",
        "4932430483",
      ),
    ).toBe("Batteria M18 B5 18V 5.0Ah REDLITHIUM agli ioni di litio");
    expect(displayName("MILWAUKEE M18 B5 18V 5.0Ah REDLITHIUM Li-Ion Battery", "4932430483")).toBe(
      "M18 B5 18V 5.0Ah REDLITHIUM Li-Ion Battery",
    );
  });

  it("keeps numbers that are part of the name", () => {
    expect(displayName("ΔΙΣΚΟΣ ΚΟΠΗΣ 125 ΜΜ", "4932451490")).toBe("ΔΙΣΚΟΣ ΚΟΠΗΣ 125 ΜΜ");
    expect(displayName('ΜΠΟΥΛΟΝΟΚΛΕΙΔΟ 1/2" M18 FHIW2F12-502X FUEL 4933492783', "4933492783")).toBe(
      'ΜΠΟΥΛΟΝΟΚΛΕΙΔΟ 1/2" M18 FHIW2F12-502X FUEL',
    );
  });

  it("never returns an empty name", () => {
    expect(displayName("4933479859", "4933479859")).toBe("4933479859");
  });
});

describe("platformTag", () => {
  it("names the platform, with FUEL when the tool is FUEL", () => {
    expect(platformTag("ΓΩΝΙΑΚΟΣ ΤΡΟΧΟΣ M18 FSAG125XB-0X 4933478429")).toBe("M18 FUEL");
    expect(platformTag("ΤΡΟΧΟΣ ΓΩΝΙΑΚΟΣ Μ12 FCOT-0 FUEL 4933464618")).toBe("M12 FUEL");
    expect(platformTag("ΜΠΑΤΑΡΙΑ 18V 5.0AH M18 B5 4932430483")).toBe("M18");
    expect(platformTag("ΚΟΦΤΗΣ ΚΑΛΩΔΙΩΝ + REMOTE M18 HCC75-502C 4933459271")).toBe("M18");
  });

  it("tags MX FUEL", () => {
    expect(platformTag("ΚΑΡΟΤΙΕΡΑ MXF DCD150-302C KIT 4933471835")).toBe("MX FUEL");
  });

  it("has no tag for products outside a platform", () => {
    expect(platformTag("ΕΡΓΑΛΕΙΟΘΗΚΗ PACKOUT 4932464078")).toBeNull();
  });
});
