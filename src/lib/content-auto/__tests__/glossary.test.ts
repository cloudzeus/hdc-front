import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GLOSSARY, glossaryFor } from "@/lib/content-auto/glossary";

/** The guide as a reader sees it: no bold markers, links as their text. */
const guide = readFileSync(path.resolve(__dirname, "../../../../docs/content/news/17-lexiko-texnologion-milwaukee/el.md"), "utf8")
  .replace(/\*\*/g, "")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/^- /gm, "");

describe("the Milwaukee technology glossary", () => {
  it.each(GLOSSARY.map((g) => [g.term, g.text]))("«%s» is copied verbatim from our published guide", (_term, text) => {
    expect(guide).toContain(text);
  });

  it("covers the technologies the review named", () => {
    expect(GLOSSARY.map((g) => g.term)).toEqual(
      expect.arrayContaining(["FUEL", "POWERSTATE", "REDLINK PLUS", "REDLITHIUM", "HIGH OUTPUT", "FORGE", "ONE-KEY", "PACKOUT", "M12", "M18", "MX FUEL"]),
    );
  });

  it("gives a pack only what its products use", () => {
    const fuelM18 = { platform: "M18", fuel: true, oneKey: false, text: "ΦΥΣΗΤΗΡΑΣ M18 FBLG3-802 2 x M18 FB8, M12-18 FC" };
    expect(glossaryFor([fuelM18]).map((g) => g.term)).toEqual(["M18", "M12-18", "FUEL", "POWERSTATE", "REDLINK PLUS", "REDLITHIUM", "FORGE"]);
    const plain = { platform: "M12", fuel: false, oneKey: false, text: "ΦΑΚΟΣ M12 LL" };
    expect(glossaryFor([plain]).map((g) => g.term)).toEqual(["M12"]);
    expect(glossaryFor([{ platform: null, fuel: false, oneKey: true, text: "PACKOUT" }]).map((g) => g.term)).toEqual(["ONE-KEY", "PACKOUT"]);
  });
});
