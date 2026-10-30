import { describe, test, expect, vi, beforeEach } from "vitest";

// listEditableIntlPages reads the override cache, which hits prisma.
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { messageOverride: { findMany, upsert: vi.fn(), deleteMany: vi.fn() } },
}));

import { listEditableIntlPages } from "@/lib/content/messages";
import { INTL_PAGES } from "@/lib/content/pages-intl";

beforeEach(() => findMany.mockReset());

describe("listEditableIntlPages", () => {
  test("returns one group per registered page, each with its paths in order", async () => {
    findMany.mockResolvedValue([]);
    const pages = await listEditableIntlPages("el");

    expect(pages).toHaveLength(INTL_PAGES.length);
    const oroi = pages.find((p) => p.id === "oroi-chrisis")!;
    expect(oroi.fields.map((f) => f.path)).toEqual(["content.t_oroi", "content.lead_oroi"]);
    // nothing overridden ⇒ value equals the catalogue value and overridden=false
    expect(oroi.fields.every((f) => f.overridden === false && f.value === f.base)).toBe(true);
  });

  test("surfaces an override on the right field only", async () => {
    findMany.mockResolvedValue([{ path: "content.t_oroi", value: "ΝΕΟΣ τίτλος" }]);
    const pages = await listEditableIntlPages("el");
    const oroi = pages.find((p) => p.id === "oroi-chrisis")!;

    const title = oroi.fields.find((f) => f.path === "content.t_oroi")!;
    expect(title.overridden).toBe(true);
    expect(title.value).toBe("ΝΕΟΣ τίτλος");

    const lead = oroi.fields.find((f) => f.path === "content.lead_oroi")!;
    expect(lead.overridden).toBe(false);
  });
});
