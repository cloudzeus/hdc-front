import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import elMessages from "@/messages/el.json";
import enMessages from "@/messages/en.json";
import itMessages from "@/messages/it.json";

const catalogs = { el: elMessages, en: enMessages, it: itMessages } as Record<string, { epibebaiosi: { Hdc: Record<string, string> } }>;

vi.mock("next-intl/server", () => ({
  getTranslations: async () => {
    const locale = (globalThis as { __locale?: string }).__locale ?? "el";
    return (key: string, params: Record<string, unknown> = {}) => {
      const raw = catalogs[locale].epibebaiosi.Hdc[key];
      if (raw === undefined) throw new Error(`missing epibebaiosi.Hdc.${key} (${locale})`);
      return raw.replace(/\{(\w+)\}/g, (_m, name) => String(params[name] ?? `{${name}}`));
    };
  },
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const { HdcOrderConfirmation } = await import("@/components/checkout/HdcOrderConfirmation");

const NOTE = "Ενδοκοινοτική παράδοση — απαλλαγή ΦΠΑ (αντίστροφη επιβάρυνση, άρθρο 138 Οδηγίας 2006/112/ΕΚ)";

const order = {
  orderNumber: "HDC-20261027-0001",
  status: "CONFIRMED",
  paymentStatus: "PAID",
  paymentMethod: "card",
  shippingMethod: "dhl",
  supplierOrder: false,
  createdAt: new Date("2026-10-27T09:31:00Z"),
  reservedUntil: null,
  email: "hans@example.de",
  shipLine1: "Hauptstr. 1",
  shipLine2: null,
  shipPostcode: "10115",
  shipCity: "Berlin",
  shipCountry: "DE",
  wantsInvoice: true,
  companyName: "Muller GmbH",
  vatNumber: "DE123456789",
  acsVoucherNo: null,
  subtotalGross: 200,
  shippingGross: 31.4,
  paymentFeeGross: 0,
  vatAmount: 0,
  totalGross: 231.4,
  depositCode: null,
  payUrl: null,
  isGuest: false,
  lines: [{ id: "l1", name: "M18 FPD3", quantity: 2, lineGross: 248, imageUrl: null, vatRate: 24 }],
  vatMode: "intra_eu_exempt",
  viesConsultationNumber: "WAPIAAAAY1234567",
} as Parameters<typeof HdcOrderConfirmation>[0]["order"];

async function render(over: Record<string, unknown> = {}, locale: "el" | "en" | "it" = "el") {
  (globalThis as { __locale?: string }).__locale = locale;
  const tree = await HdcOrderConfirmation({ order: { ...order, ...over } as typeof order, locale });
  return renderToStaticMarkup(tree).replace(/&nbsp;| /g, " ");
}

describe("order confirmation — intra-EU exempt", () => {
  it("shows the note, the VAT number with its prefix and the VIES number, never «Περιλαμβάνεται ΦΠΑ»", async () => {
    const html = await render();
    expect(html).toContain(NOTE);
    expect(html).toContain("DE123456789");
    expect(html).toContain("WAPIAAAAY1234567");
    expect(html).not.toContain("Περιλαμβάνεται ΦΠΑ");
  });

  it("shows the line at its net, not the 24% gross", async () => {
    const html = await render({ lines: [{ ...order.lines[0], lineGross: 248, lineNet: 200 }] });
    expect(html).toContain("200,00");
    expect(html).not.toContain("248,00");
  });

  it("translates the note", async () => {
    expect(await render({}, "en")).toMatch(/Intra-Community supply/);
    expect(await render({}, "it")).toMatch(/intracomunitaria/i);
  });

  it("a Greek order is untouched", async () => {
    const html = await render({
      vatMode: "standard", viesConsultationNumber: null, shipCountry: "GR", shippingMethod: "courier",
      vatAmount: 48, subtotalGross: 248, shippingGross: 0, totalGross: 248,
    });
    expect(html).toContain("Περιλαμβάνεται ΦΠΑ 24%");
    expect(html).not.toContain("Ενδοκοινοτική");
    expect(html).not.toContain("VIES");
  });
});
