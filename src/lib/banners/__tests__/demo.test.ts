import { describe, expect, it } from "vitest";
import { STATIC_DEMO, mergeDemo } from "@/lib/banners/demo";

describe("banner gallery demo", () => {
  it("is Milwaukee, with no Kolleris or FACOM leftovers", () => {
    const text = JSON.stringify(STATIC_DEMO);
    expect(text).not.toMatch(/kolleris|facom/i);
    expect(STATIC_DEMO.tokens["{title}"]).toBe("M18 FUEL δραπανοκατσάβιδο");
  });
  it("takes the resolved product and keeps static values for what a product does not give", () => {
    const merged = mergeDemo(
      {
        tokens: { "{title}": "M18 FUEL ΚΡΟΥΣΤΙΚΟ", "{image}": "https://cdn/x.webp", "{compare}": "" },
        href: "/proion/x",
        image: "https://cdn/x.webp",
      },
      { tokens: {}, href: "#", image: "", items: [{ slug: "a", name: "A", image: "i", price: "1 €" }] },
    );
    expect(merged.tokens["{title}"]).toBe("M18 FUEL ΚΡΟΥΣΤΙΚΟ");
    expect(merged.tokens["{image}"]).toBe("https://cdn/x.webp");
    expect(merged.tokens["{compare}"]).toBe(STATIC_DEMO.tokens["{compare}"]);
    expect(merged.tokens["{badge}"]).toBe("-15%");
    expect(merged.items).toHaveLength(1);
    expect(merged.href).toBe("#");
  });
  it("falls back to the static demo without a product", () => {
    expect(mergeDemo(undefined, undefined)).toBe(STATIC_DEMO);
  });
});
