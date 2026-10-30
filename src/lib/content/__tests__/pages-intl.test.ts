import { describe, test, expect } from "vitest";
import el from "@/messages/el.json";
import { INTL_PAGES, EDITABLE_INTL_PATHS } from "@/lib/content/pages-intl";

/** Walk a dotted path without pulling in the server-only messages module. */
function leaf(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

describe("INTL_PAGES registry", () => {
  test("every editable path resolves to a real string in the el catalogue", () => {
    // A path that no longer exists would silently never render in the editor;
    // this is the guard that keeps the allowlist honest against the catalogue.
    for (const p of EDITABLE_INTL_PATHS) {
      expect(typeof leaf(el, p), `missing catalogue key: ${p}`).toBe("string");
    }
  });

  test("every editable path is under the content namespace", () => {
    for (const p of EDITABLE_INTL_PATHS) {
      expect(p.startsWith("content."), p).toBe(true);
    }
  });

  test("no path appears in two pages", () => {
    const all = INTL_PAGES.flatMap((pg) => pg.paths);
    expect(new Set(all).size).toBe(all.length);
  });
});
