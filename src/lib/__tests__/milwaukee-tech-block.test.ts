import { describe, expect, it } from "vitest";
import { parseTechBlock, kitFromTechBlock } from "@/lib/milwaukee/tech-block";

// The actual tail of M18 FPD3-502X's Greek description in HDCtool.
const FPD3_KIT = `…και HD Box για μεταφορά και αποθήκευση.

Τεχνικά χαρακτηριστικά:
Κωδικός: 4933479860
Χωρητικότητα τσοκ (mm): 13
Μέγιστη ροπή (Nm): 158
Ταχύτητα χωρίς φορτίο 2 (rpm): 0 – 2100
Χωρητικότητα μπαταρίας (Ah): 5.0
Αρ. παρεχόμενων μπαταριών: 2
Βάρος με μπαταρία (EPTA) (kg): 2.2 (M18 B5)`;

describe("parseTechBlock", () => {
  it("reads every label: value line after the heading", () => {
    const rows = parseTechBlock(FPD3_KIT);
    expect(rows[0]).toEqual({ label: "Κωδικός", value: "4933479860" });
    expect(rows).toContainEqual({ label: "Μέγιστη ροπή (Nm)", value: "158" });
    expect(rows).toContainEqual({ label: "Βάρος με μπαταρία (EPTA) (kg)", value: "2.2 (M18 B5)" });
    expect(rows).toHaveLength(7);
  });

  it("is empty without the heading — never guesses from the prose", () => {
    expect(parseTechBlock("Ροπή 158 Nm και τσοκ 13 mm.")).toEqual([]);
    expect(parseTechBlock(null)).toEqual([]);
  });

  it("drops rows whose value is a dash", () => {
    const rows = parseTechBlock("Τεχνικά χαρακτηριστικά:\nΧωρητικότητα μπαταρίας (Ah): -\nΤάση (V): 18");
    expect(rows).toEqual([{ label: "Τάση (V)", value: "18" }]);
  });

  it("strips a trailing \\r on Windows line endings", () => {
    const rows = parseTechBlock("Τεχνικά χαρακτηριστικά:\r\nΤάση (V): 18\r\n");
    expect(rows).toEqual([{ label: "Τάση (V)", value: "18" }]);
  });
});

describe("kitFromTechBlock", () => {
  it("reads batteries and capacity from the manufacturer's lines", () => {
    expect(kitFromTechBlock(parseTechBlock(FPD3_KIT))).toEqual({ batteries: 2, ah: 5 });
  });
  it("is null for a bare tool", () => {
    const bare = parseTechBlock("Τεχνικά χαρακτηριστικά:\nΧωρητικότητα μπαταρίας (Ah): -\nΑρ. παρεχόμενων μπαταριών: -");
    expect(kitFromTechBlock(bare)).toBeNull();
  });
});
