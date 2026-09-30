import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A loading.tsx starts streaming, and a streamed response is committed as 200
 * before the page can call notFound() — an unknown product then answers
 * 200 + noindex, a soft 404. These detail routes must have no loading.tsx on
 * their way up to the app root; they check existence first and show their
 * skeleton from their own <Suspense>.
 */
const APP = path.resolve(__dirname, "../../app");
const DETAIL_ROUTES = [
  "[locale]/proion/[slug]",
  "[locale]/katalogos/[kathgoria]",
  "[locale]/blog/[slug]",
  "[locale]/odigoi/[slug]",
  "[locale]/montelo/[model]",
  "[locale]/brands/[slug]",
  "[locale]/prosfores/[slug]",
];

describe("detail routes answer a real 404", () => {
  for (const route of DETAIL_ROUTES) {
    it(`${route} has no loading.tsx above it`, () => {
      expect(fs.existsSync(path.join(APP, route, "page.tsx"))).toBe(true);
      const parts = route.split("/");
      for (let i = parts.length; i >= 0; i--) {
        const dir = path.join(APP, ...parts.slice(0, i));
        expect(fs.existsSync(path.join(dir, "loading.tsx")), dir).toBe(false);
      }
    });
  }
});
