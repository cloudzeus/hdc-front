import { describe, expect, it } from "vitest";
import { ownOrigin, ownUrl } from "@/lib/seo/own-page";

describe("the JSON-LD check fetches only this shop", () => {
  it("builds its address from the server's own port", () => {
    expect(ownOrigin({ PORT: "3000" })).toBe("http://127.0.0.1:3000");
  });

  it("accepts a path and nothing that leaves the origin", () => {
    const origin = "http://127.0.0.1:3000";
    expect(ownUrl("/proion/x?y=1", origin)?.href).toBe("http://127.0.0.1:3000/proion/x?y=1");
    for (const path of ["//evil.example/", "/\\evil.example", "https://evil.example/", "proion/x", "/a\\b"]) {
      expect(ownUrl(path, origin), path).toBeNull();
    }
  });
});
