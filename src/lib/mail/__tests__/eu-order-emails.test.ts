import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null) }, product: { findMany: vi.fn(async () => []) }, brand: { findMany: vi.fn(async () => []) } },
}));
vi.mock("@/lib/mail/client", () => ({ mailConfigured: () => true, sendMail: vi.fn() }));

process.env.AUTH_SECRET = "test-only-secret-for-image-signatures";

const { buildOrderView } = await import("@/lib/mail/hdc/order-view");
const { buildInternalOrderEmail } = await import("@/lib/mail/order-internal-email");
const { buildOrderEmail } = await import("@/lib/mail/order-email");
const { buildOrderStatusEmail } = await import("@/lib/mail/order-status-email");
const { buildShippedEmail } = await import("@/lib/mail/order-shipped-email");
const { buildDeliveredEmail } = await import("@/lib/mail/order-delivered-email");
const { buildPaymentFailedEmail } = await import("@/lib/mail/payment-failed-email");
const { buildPostageCorrectionEmail } = await import("@/lib/mail/postage-correction-email");
const { buildReviewRequestEmail } = await import("@/lib/mail/review-request-email");
const { orderLocale } = await import("@/lib/mail/hdc/order-view");

const NOTE = "Ενδοκοινοτική παράδοση — απαλλαγή ΦΠΑ (αντίστροφη επιβάρυνση, άρθρο 138 Οδηγίας 2006/112/ΕΚ)";

const order = {
  id: "o1",
  orderNumber: "HDC-20261027-0001",
  status: "CONFIRMED",
  paymentStatus: "PAID",
  customerId: null,
  guestToken: "tok",
  email: "hans@example.de",
  phone: "+49 30 1234",
  firstName: "Hans",
  lastName: "Muller",
  shipLine1: "Hauptstr. 1",
  shipLine2: null,
  shipCity: "Berlin",
  shipPostcode: "10115",
  shipCountry: "DE",
  billCountry: "DE",
  wantsInvoice: true,
  companyName: "Muller GmbH",
  vatNumber: "DE123456789",
  taxOffice: null,
  billLine1: "Hauptstr. 1",
  billCity: "Berlin",
  billPostcode: "10115",
  customerType: "company",
  vatMode: "intra_eu_exempt",
  viesConsultationNumber: "WAPIAAAAY1234567",
  viesCheckedAt: new Date("2026-10-27T09:30:00.000Z"),
  shippingMethod: "dhl",
  paymentMethod: "card",
  notes: null,
  supplierOrder: false,
  subtotalNet: 200,
  subtotalGross: 200,
  shippingNet: 31.4,
  shippingGross: 31.4,
  paymentFeeNet: 0,
  paymentFeeGross: 0,
  vatAmount: 0,
  totalGross: 231.4,
  savingsGross: 0,
  shippingQuote: { carrier: "DHL", productCode: "U", etaDays: "2–3", locale: "el" } as Record<string, unknown>,
  paidAt: new Date("2026-10-27T09:35:00Z"),
  createdAt: new Date("2026-10-27T09:31:00Z"),
  lines: [
    {
      productId: "p1", sku: "4933479860", name: "M18 FPD3", brand: null, imageUrl: null, quantity: 2,
      unitNet: 100, unitGross: 124, discountPercent: 0, offerTitle: null, vatRate: 24, lineNet: 200, lineGross: 248, weightKg: null,
    },
  ],
};

const asRef = (over: Record<string, unknown> = {}) => ({ ...order, ...over }) as unknown as Parameters<typeof buildOrderView>[0];
const plain = (s: string) => s.replace(/ /g, " ");

describe("order view — intra-EU exempt", () => {
  it("states the note, the VAT number with its prefix and the VIES number, never «Περιλαμβάνεται ΦΠΑ»", async () => {
    const view = await buildOrderView(asRef(), "el");
    expect(view.vat_line).toBe(NOTE);
    const billing = view.cols[1].lines.join("\n");
    expect(billing).toContain("DE123456789");
    expect(billing).toContain("WAPIAAAAY1234567");
    expect(billing).not.toMatch(/ΔΟΥ/);
    expect(JSON.stringify(view)).not.toContain("Περιλαμβάνεται ΦΠΑ");
  });

  it("shows the lines at their net, adding up to the total", async () => {
    const view = await buildOrderView(asRef(), "el");
    expect(plain(view.items[0].total)).toContain("200,00");
    expect(plain(view.total)).toContain("231,40");
    expect(view.prices_label).toBe("Τιμές χωρίς ΦΠΑ");
  });

  it("translates the note", async () => {
    const en = await buildOrderView(asRef(), "en");
    expect(en.vat_line).toMatch(/Intra-Community supply/);
    expect(en.vat_line).toMatch(/138/);
    const it = await buildOrderView(asRef(), "it");
    expect(it.vat_line).toMatch(/intracomunitaria/i);
    expect(it.vat_line).toMatch(/138/);
  });

  it("a Greek order is untouched: the VAT line, «Τιμές με ΦΠΑ»", async () => {
    const view = await buildOrderView(
      asRef({
        vatMode: "standard", billCountry: "GR", shipCountry: "GR", vatNumber: "123456789", taxOffice: "Α΄ Πειραιά",
        customerType: null, viesConsultationNumber: null, vatAmount: 48, totalGross: 248, subtotalGross: 248, shippingGross: 0,
      }),
      "el",
    );
    expect(view.vat_line).toMatch(/^Περιλαμβάνεται ΦΠΑ 24%/);
    expect(view.prices_label).toBe("Τιμές με ΦΠΑ");
    expect(view.cols[1].lines.join("\n")).toContain("ΔΟΥ Α΄ Πειραιά");
  });

  it("a company abroad charged VAT shows the VAT line and the prefixed number, no exemption note", async () => {
    const view = await buildOrderView(
      asRef({ vatMode: "standard", viesConsultationNumber: null, vatAmount: 48, totalGross: 279.4, subtotalGross: 248, shippingGross: 31.4 }),
      "el",
    );
    expect(view.vat_line).toMatch(/Περιλαμβάνεται ΦΠΑ/);
    expect(JSON.stringify(view)).not.toContain("Ενδοκοινοτική");
    expect(view.cols[1].lines.join("\n")).toContain("DE123456789");
  });
});

describe("the emails", () => {
  it("the customer's confirmation carries the note and the VIES number, no «Περιλαμβάνεται ΦΠΑ»", async () => {
    /* Greek explicitly (the admin preview's choice): a DE order is English by default, below. */
    const built = await buildOrderEmail(asRef(), { locale: "el" });
    const text = plain(built!.email.text);
    expect(text).toContain(NOTE);
    expect(text).toContain("DE123456789");
    expect(text).toContain("WAPIAAAAY1234567");
    expect(text).not.toContain("Περιλαμβάνεται ΦΠΑ");
  });

  it("the internal email says «ΕΕ — εταιρεία, VIES ✓ <n>» for an exempt company", async () => {
    const built = await buildInternalOrderEmail(asRef());
    const text = plain(built!.email.text);
    expect(text).toContain("ΕΕ — εταιρεία, VIES ✓ WAPIAAAAY1234567");
    expect(text).toContain(NOTE);
  });

  it("the internal email says «ΕΕ — ιδιώτης» for a consumer abroad", async () => {
    const built = await buildInternalOrderEmail(
      asRef({
        customerType: "individual", vatMode: "standard", wantsInvoice: false, companyName: null, vatNumber: null,
        viesConsultationNumber: null, vatAmount: 48, totalGross: 279.4, subtotalGross: 248,
      }),
    );
    const text = plain(built!.email.text);
    expect(text).toContain("ΕΕ — ιδιώτης");
    expect(text).not.toContain("VIES");
  });

  it("the internal email for a company charged VAT does not claim a VIES check", async () => {
    const built = await buildInternalOrderEmail(
      asRef({ vatMode: "standard", viesConsultationNumber: null, vatAmount: 48, totalGross: 279.4, subtotalGross: 248 }),
    );
    const text = plain(built!.email.text);
    expect(text).toContain("ΕΕ — εταιρεία, με ΦΠΑ");
    expect(text).not.toContain("VIES ✓");
  });

  it("a Greek order's internal email has no EU row", async () => {
    const built = await buildInternalOrderEmail(
      asRef({
        shipCountry: "GR", billCountry: "GR", customerType: null, vatMode: "standard", viesConsultationNumber: null,
        vatNumber: "123456789", taxOffice: "Α΄", vatAmount: 48, totalGross: 248, subtotalGross: 248, shippingGross: 0, shippingMethod: "courier",
      }),
    );
    expect(plain(built!.email.text)).not.toContain("ΕΕ —");
  });
});

/*
 * Abroad, every customer email is in English — whatever language the site was
 * in when the order was placed (the order froze «el» in `shippingQuote`).
 */
describe("customer emails for an order shipped abroad are English", () => {
  const builders: Array<[string, (ref: Parameters<typeof buildOrderView>[0]) => Promise<{ email: { html: string; subject: string } } | null>]> = [
    ["order confirmation", (o) => buildOrderEmail(o)],
    ["payment received", (o) => buildOrderEmail(o, { trigger: "payment" })],
    ["status", (o) => buildOrderStatusEmail(o, "Preparing")],
    ["shipped", (o) => buildShippedEmail(o, "JD0123456789")],
    ["delivered", (o) => buildDeliveredEmail(o)],
    ["payment failed", (o) => buildPaymentFailedEmail(o, { statusId: "E" })],
    ["postage correction", (o) => buildPostageCorrectionEmail(o, { previousShippingGross: 40, previousTotalGross: 240 })],
    ["review request", (o) => buildReviewRequestEmail(o, { preview: true })],
  ];

  it.each(builders)("%s: a DE order placed from the Greek site", async (_name, build) => {
    const built = await build(asRef());
    expect(built).not.toBeNull();
    expect(built!.email.html).toContain('lang="en"');
    expect(built!.email.html).not.toContain('lang="el"');
  });

  it.each(builders)("%s: a Greek order keeps its language", async (_name, build) => {
    const built = await build(asRef({ shipCountry: "GR", billCountry: "GR", shippingMethod: "courier", vatMode: "standard" }));
    expect(built!.email.html).toContain('lang="el"');
  });

  it("the exemption note is in English in the confirmation", async () => {
    const built = await buildOrderEmail(asRef());
    expect(plain(built!.email.text)).toContain(
      "Intra-Community supply — VAT exempt (reverse charge, Article 138 of Directive 2006/112/EC)",
    );
    expect(plain(built!.email.text)).not.toContain("Ενδοκοινοτική");
  });

  it("a Greek order whose customer chose English stays English; an Italian one abroad is English", () => {
    expect(orderLocale({ shippingQuote: { locale: "en" }, shipCountry: "GR" })).toBe("en");
    expect(orderLocale({ shippingQuote: { locale: "it" }, shipCountry: "IT" })).toBe("en");
    expect(orderLocale({ shippingQuote: { locale: "it" }, shipCountry: "GR" })).toBe("it");
    expect(orderLocale({ shippingQuote: null, shipCountry: "GR" })).toBe("el");
    expect(orderLocale({ shippingQuote: null })).toBe("el");
  });

  it("the internal email stays Greek", async () => {
    const built = await buildInternalOrderEmail(asRef());
    expect(built!.email.html).toContain('lang="el"');
  });
});
