import { describe, expect, it } from "vitest";
import { batteryOf, kitBatteries, myTools, type OwnedLine } from "@/lib/account/my-tools";

/** Real catalogue names (hdcfront, September 2026). */
const line = (over: Partial<OwnedLine> & Pick<OwnedLine, "name">): OwnedLine => ({
  key: over.name,
  platform: null,
  modelRoot: null,
  modelContent: null,
  image: `https://img/${over.name.split(" ").pop()}.webp`,
  quantity: 1,
  description: null,
  ...over,
});

const B5 = line({ name: "ΜΠΑΤΑΡΙΑ 18V 5.0AH M18 B5 4932430483", platform: "M18" });
const HB5 = line({ name: "ΜΠΑΤΑΡΙΑ LI-ON M12 HB5 5AH 4932480165", platform: "M12" });
const FSAG_BARE = line({
  name: "ΓΩΝΙΑΚΟΣ ΤΡΟΧΟΣ M18 FSAG125XB-0X FUEL 4933478429",
  platform: "M18",
  modelRoot: "M18 FSAG125XB",
  modelContent: "bare",
});
const FPD3_KIT = line({
  name: "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18FPD3-502X FUEL 4933479860",
  platform: "M18",
  modelRoot: "M18 FPD3",
  modelContent: "kit",
});
const FPD3_BARE = line({
  name: "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-0X FUEL 4933479859",
  platform: "M18",
  modelRoot: "M18 FPD3",
  modelContent: "bare",
});

describe("batteryOf", () => {
  it("reads the capacity from the battery code", () => {
    expect(batteryOf(B5)).toBe(5);
    expect(batteryOf(HB5)).toBe(5);
    expect(batteryOf(line({ name: "ΜΠΑΤΑΡΙΑ LI-ON M12 HB2.5 2,5AH 4932480164", platform: "M12" }))).toBe(2.5);
    expect(batteryOf(line({ name: "ΜΠΑΤΑΡΙΑ FORGE M18FB12 12.0Ah 4932492651", platform: "M18" }))).toBe(12);
    expect(batteryOf(line({ name: "ΜΠΑΤΑΡΙΑ LI-ION M12B4 - 4AH 4932430065", platform: "M12" }))).toBe(4);
  });

  it("reads a Greek Β in the code as a Latin B", () => {
    expect(batteryOf(line({ name: "ΜΠΑΤΑΡΙΑ 18V 5,0AH M18Β5-CR 4932479265", platform: "M18" }))).toBe(5);
  });

  it("is not fooled by tools «ΜΠΑΤΑΡΙΑΣ» or by products without a platform", () => {
    expect(batteryOf(FSAG_BARE)).toBeNull();
    expect(
      batteryOf(line({ name: "ΨΕΚΑΣΤΗΡΑΣ ΜΠΑΤΑΡΙΑΣ SWITCH TANK 15L M18 BPFP-CST 4933464964", platform: "M18" })),
    ).toBeNull();
    expect(batteryOf(line({ name: "USB ΕΠΑΝ/ΝΗ ΜΠΑΤΑΡΙΑ 3.0 ΑΗ L4 B3 4933478311" }))).toBeNull();
  });
});

describe("kitBatteries", () => {
  it("prefers the manufacturer's block", () => {
    const description =
      "Κείμενο.\n\nΤεχνικά χαρακτηριστικά:\nΑριθμός παρεχόμενων μπαταριών: 3\nΧωρητικότητα μπαταρίας (Ah): 4.0\n";
    expect(kitBatteries({ name: FPD3_KIT.name, description })).toEqual({ count: 3, ah: 4 });
  });

  it("falls back to the model suffix", () => {
    expect(kitBatteries(FPD3_KIT)).toEqual({ count: 2, ah: 5 });
  });
});

describe("myTools", () => {
  it("is empty without platform products", () => {
    expect(myTools([])).toEqual([]);
    expect(myTools([line({ name: "ΚΑΤΣΑΒΙΔΙ 4932471791" })])).toEqual([]);
  });

  it("is the mockup: M18 with 2 tools and 4 batteries, M12 with a lone battery", () => {
    const result = myTools([
      FPD3_KIT,
      { ...B5, quantity: 2 },
      FSAG_BARE,
      HB5,
    ]);

    expect(result.map((p) => p.platform)).toEqual(["M18", "M12"]);
    const [m18, m12] = result;

    expect(m18.tools).toBe(2);
    expect(m18.batteries).toBe(4); // 2 in the kit + 2 loose
    expect(m18.capacities).toEqual([5]);
    expect(m18.tip).toBe("bare");
    expect(m18.thumbs.map((t) => [t.kind, t.count])).toEqual([
      ["tool", null],
      ["tool", null],
      ["battery", 4],
    ]);

    expect(m12.tools).toBe(0);
    expect(m12.batteries).toBe(1);
    expect(m12.tip).toBe("tools");
    expect(m12.thumbs).toEqual([{ kind: "battery", name: HB5.name, image: HB5.image, count: 1 }]);
  });

  it("counts a bare tool and its kit as one tool", () => {
    const [m18] = myTools([FPD3_KIT, FPD3_BARE]);
    expect(m18.tools).toBe(1);
    expect(m18.batteries).toBe(2);
    expect(m18.thumbs).toHaveLength(1);
    expect(m18.thumbs[0].count).toBe(2);
  });

  it("multiplies kit batteries by quantity", () => {
    const [m18] = myTools([{ ...FPD3_KIT, quantity: 3 }]);
    expect(m18.batteries).toBe(6);
  });

  it("gives no tip for tools without batteries", () => {
    const [m18] = myTools([FSAG_BARE]);
    expect(m18.batteries).toBe(0);
    expect(m18.tip).toBeNull();
  });

  it("lists every capacity, largest first", () => {
    const [m18] = myTools([B5, line({ name: "ΜΠΑΤΑΡΙΑ 18V 8,0AH M18 B8 4932471070 MILWAUKEE", platform: "M18" })]);
    expect(m18.capacities).toEqual([8, 5]);
    expect(m18.batteries).toBe(2);
    // One battery tile stands for all of them.
    expect(m18.thumbs.filter((t) => t.kind === "battery")).toHaveLength(1);
  });

  it("shows at most three thumbnails, the battery last", () => {
    const tools = ["A", "B", "C", "D"].map((m) =>
      line({ name: `ΕΡΓΑΛΕΙΟ M18 F${m}-0 4933000000`, platform: "M18", modelRoot: `M18 F${m}`, modelContent: "bare" }),
    );
    expect(myTools(tools)[0].thumbs).toHaveLength(3);
    const withBattery = myTools([...tools, B5])[0];
    expect(withBattery.tools).toBe(4);
    expect(withBattery.thumbs.map((t) => t.kind)).toEqual(["tool", "tool", "battery"]);
  });

  it("treats an energy pack as batteries, not a tool", () => {
    const [m18] = myTools([
      line({ name: "ΣΕΤ ΜΠΑΤΑΡΙΩΝ M18 NRG-502 4933459217", platform: "M18", modelRoot: "M18 NRG", modelContent: "kit" }),
    ]);
    expect(m18.tools).toBe(0);
    expect(m18.batteries).toBe(2);
    expect(m18.tip).toBe("tools");
  });

  it("ignores zero-quantity lines", () => {
    expect(myTools([{ ...B5, quantity: 0 }])).toEqual([]);
  });
});
