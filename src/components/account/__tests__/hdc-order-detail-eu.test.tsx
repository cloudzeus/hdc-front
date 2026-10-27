import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import elMessages from "@/messages/el.json";
import enMessages from "@/messages/en.json";
import itMessages from "@/messages/it.json";

const catalogs = { el: elMessages, en: enMessages, it: itMessages } as Record<
  string,
  { account: { Hdc: Record<string, string> } }
>;

vi.mock("next-intl/server", () => ({
  getTranslations: async () => {
    const locale = (globalThis as { __locale?: string }).__locale ?? "el";
    return (key: string, params: Record<string, unknown> = {}) => {
      const raw = catalogs[locale].account.Hdc[key];
      if (raw === undefined) throw new Error(`missing account.Hdc.${key} (${locale})`);
      return raw.replace(/\{(\w+)\}/g, (_m, name) => String(params[name] ?? `{${name}}`));
    };
  },
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/account/ReorderButton", () => ({ ReorderButton: () => null }));
vi.mock("@/components/account/HdcAccountParts", () => ({
  dayMonth: () => "27/10",
  shippingLabel: async (id: string) => id,
  StatusChip: () => null,
}));

const { HdcOrderDetail } = await import("@/components/account/HdcOrderDetail");

const NOTE = "Ενδοκοινοτική παράδοση — απαλλαγή ΦΠΑ (αντίστροφη επιβάρυνση, άρθρο 138 Οδηγίας 2006/112/ΕΚ)";

const order = {
  orderNumber: "HDC-20261027-0001",
  guestToken: "tok",
  status: "CONFIRMED",
  paymentStatus: "PAID",
  paymentMethod: "card",
  shippingMethod: "dhl",
  createdAt: new Date("2026-10-27T09:31:00Z"),
  paidAt: new Date("2026-10-27T09:35:00Z"),
  shippedAt: null,
  deliveredAt: null,
  shipLine1: "Hauptstr. 1",
  shipLine2: null,
  shipPostcode: "10115",
  shipCity: "Berlin",
  shipCountry: "DE",
  acsVoucherNo: null,
  wantsInvoice: true,
  companyName: "Muller GmbH",
  vatNumber: "DE123456789",
  documentNo: null,
  vatMode: "intra_eu_exempt",
  viesConsultationNumber: "WAPIAAAAY1234567",
  subtotalGross: 200,
  shippingGross: 31.4,
  paymentFeeGross: 0,
  vatAmount: 0,
  totalGross: 231.4,
  splitWith: null,
  lines: [{ id: "l1", name: "M18 FPD3", sku: "4933479860", quantity: 2, lineGross: 248, lineNet: 200, imageUrl: null, vatRate: 24 }],
} as Parameters<typeof HdcOrderDetail>[0]["order"];

async function render(over: Record<string, unknown> = {}, locale: "el" | "en" | "it" = "el") {
  (globalThis as { __locale?: string }).__locale = locale;
  const tree = await HdcOrderDetail({ order: { ...order, ...over } as typeof order, locale });
  return renderToStaticMarkup(tree).replace(/&nbsp;| /g, " ");
}

describe("account order detail — intra-EU exempt", () => {
  it("shows the line at its net, the note, the prefixed ΑΦΜ and the VIES number, no VAT row", async () => {
    const html = await render();
    expect(html).toContain(NOTE);
    expect(html).toContain("DE123456789");
    expect(html).toContain("WAPIAAAAY1234567");
    expect(html).toContain("200,00");
    expect(html).not.toContain("248,00");
    expect(html).not.toMatch(/ΦΠΑ 24%/);
    expect(html).not.toMatch(/<dt>ΦΠΑ<\/dt>/);
  });

  it("translates the note", async () => {
    expect(await render({}, "en")).toMatch(/Intra-Community supply/);
    expect(await render({}, "it")).toMatch(/intracomunitaria/i);
  });

  it("a Greek order is untouched: gross line, the 24% row, no note", async () => {
    const html = await render({
      vatMode: "standard", viesConsultationNumber: null, shipCountry: "GR", shippingMethod: "courier",
      vatNumber: "123456789", vatAmount: 48, subtotalGross: 248, shippingGross: 0, totalGross: 248,
    });
    expect(html).toContain("248,00");
    expect(html).toContain("ΦΠΑ 24%");
    expect(html).not.toContain("Ενδοκοινοτική");
    expect(html).not.toContain("VIES");
  });
});
