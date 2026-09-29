import { describe, expect, it } from "vitest";
import { jsonLdHtml } from "@/lib/seo/json-ld";

describe("jsonLdHtml", () => {
  it("cannot close the script tag it sits in", () => {
    const html = jsonLdHtml({ description: "Φωτισμός LED </script><script>alert(1)</script>" });
    expect(html).not.toContain("<");
    expect(html).toContain("\\u003c/script>");
  });

  it("still parses back to the same object", () => {
    const value = { "@type": "Product", name: "M18 <FUEL>", offers: [{ price: "1.00" }] };
    expect(JSON.parse(jsonLdHtml(value))).toEqual(value);
  });
});
