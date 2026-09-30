import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { DEFAULT_COPY, renderCampaign } from "@/lib/newsletter/campaign";

const payload = {
  campaign: {
    eyebrow: "Προσφορές",
    discount: "-15%",
    title: "M18 FUEL",
    text: "Κείμενο",
    url: "https://example.test/prosfores",
    valid_until: "31.10.2026",
  },
  products: [],
};

describe("nl-offers without the B2B banner", () => {
  it("has empty B2B defaults", () => {
    expect(DEFAULT_COPY.b2b_eyebrow).toBe("");
    expect(DEFAULT_COPY.b2b_button).toBe("");
  });

  it("renders with the default copy and no B2B text", async () => {
    const html = await renderCampaign("nl-offers", payload);
    expect(html).toContain("M18 FUEL");
    expect(html).not.toMatch(/B2B/);
    expect(html).not.toMatch(/συνεργατη/i);
  });

  it("ignores B2B copy saved on an older campaign", async () => {
    const html = await renderCampaign("nl-offers", {
      ...payload,
      copy: { b2b_eyebrow: "Για επαγγελματιες", b2b_button: "Λογαριασμος B2B" },
    });
    expect(html).not.toMatch(/B2B|Για επαγγελματιες/);
  });
});
