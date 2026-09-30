import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Every HDC email renders, in every language it is sent in, from sample data:
 * no empty variable, no `{{`, balanced HTML, a plain-text part, no «Kolleris»
 * in what the reader sees (the legal name is Greek, «ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ», and the
 * @kolleris.com addresses are allowed), and no WebP picture.
 */

const CDN = "https://kolleris.b-cdn.net/papatheo";

const ORDER = {
  id: "o1",
  orderNumber: "HDC-20260930-0012",
  status: "CONFIRMED",
  paymentStatus: "PAID",
  customerId: null as string | null,
  guestToken: "guest-token",
  email: "nikos@example.gr",
  phone: "+30 690 000 0000",
  firstName: "Νίκος",
  lastName: "Παπαδόπουλος",
  shipLine1: "Ηρώων Πολυτεχνείου 45",
  shipLine2: null,
  shipCity: "Πειραιάς",
  shipPostcode: "18536",
  wantsInvoice: true,
  companyName: "Παπαδόπουλος Ι.Κ.Ε.",
  vatNumber: "123456789",
  taxOffice: "Α΄ Πειραιά",
  billLine1: "Ηρώων Πολυτεχνείου 45",
  billCity: "Πειραιάς",
  billPostcode: "18536",
  shippingMethod: "courier",
  paymentMethod: "card",
  notes: "Κουδούνι 3ος όροφος",
  supplierOrder: true,
  subtotalNet: 881.36,
  subtotalGross: 1092.89,
  shippingNet: 0,
  shippingGross: 0,
  paymentFeeNet: 0,
  paymentFeeGross: 0,
  vatAmount: 211.53,
  totalGross: 1092.89,
  savingsGross: 0,
  shippingQuote: { etaDays: 2, locale: "el" } as Record<string, unknown>,
  vivaOrderCode: "1234567890123456",
  paidAt: new Date("2026-09-30T08:45:00Z"),
  reservedUntil: null,
  acsVoucherNo: "7400123456",
  deliveredAt: new Date("2026-10-02T10:00:00Z"),
  createdAt: new Date("2026-09-30T08:42:00Z"),
  lines: [
    {
      productId: "p1",
      sku: "4933478449",
      name: 'ΜΠΟΥΛΟΝΟΚΛΕΙΔΟ 1/2" M18 FMTIW2F12-0X FUEL 4933478449',
      brand: "MILWAUKEE",
      imageUrl: `${CDN}/4933478449/primary-0-1751218037359.webp`,
      quantity: 1,
      unitNet: 321.08,
      discountPercent: 0,
      offerTitle: null,
      vatRate: 24,
      lineNet: 321.08,
      lineGross: 398.14,
      weightKg: 2.1,
    },
    {
      productId: "p2",
      sku: "4932430483",
      name: "ΜΠΑΤΑΡΙΑ 18V 5.0AH M18 B5",
      brand: "MILWAUKEE",
      imageUrl: `${CDN}/4932430483/primary-0-1751214102874.webp`,
      quantity: 2,
      unitNet: 133.4,
      discountPercent: 0,
      offerTitle: null,
      vatRate: 24,
      lineNet: 266.8,
      lineGross: 330.83,
      weightKg: 0.7,
    },
    {
      productId: "p3",
      sku: "4933492800",
      name: 'ΠΑΛΜΙΚΟ ΚΑΤΣΑΒΙΔΙ 1/4" M18 ONEID3-0X FUEL',
      brand: null,
      imageUrl: `${CDN}/4933492800/primary-0-1751222368563.webp`,
      quantity: 1,
      unitNet: 293.48,
      discountPercent: 0,
      offerTitle: null,
      vatRate: 24,
      lineNet: 293.48,
      lineGross: 363.92,
      weightKg: null,
    },
  ],
};

const PRODUCTS = ORDER.lines.map((l, i) => ({
  id: l.productId,
  slug: `product-${i}`,
  name: l.name,
  code: `C${i}`,
  code2: l.sku,
  priceNet: l.unitNet,
  priceList: i === 0 ? 400 : null,
  qty: i === 2 ? 0 : 5,
  inStock: i !== 2,
  supplierAvailable: true,
  mtrmark: 1364,
  images: [{ url: l.imageUrl }],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: vi.fn(async () => ORDER),
      findFirst: vi.fn(async () => ({ orderNumber: ORDER.orderNumber })),
    },
    product: { findMany: vi.fn(async () => PRODUCTS) },
    brand: { findMany: vi.fn(async () => []) },
  },
}));

const sendMail = vi.fn(async (mail: unknown) => ({ ok: true as const, id: String(Boolean(mail)) }));
vi.mock("@/lib/mail/client", () => ({
  mailConfigured: () => true,
  sendMail: (mail: unknown) => sendMail(mail),
}));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { role: "ADMIN", email: "Admin@Example.gr", name: "Διαχειριστής" } }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (Windows) Chrome/140" }) }));

process.env.BANK_TRANSFER_IBAN = "GR0000000000000000000000000";
process.env.BANK_TRANSFER_BANK = "Τράπεζα Δοκιμής";

const { EMAIL_TEMPLATES, previewEmail } = await import("@/lib/mail/hdc/catalog");
const { STRING_TABLES } = await import("@/lib/mail/hdc/strings");
const { templateFiles } = await import("@/lib/mail/hdc/render");
const { mailImageUrl, decodeMailImage } = await import("@/lib/mail/hdc/image");

const VOID = new Set(["meta", "link", "br", "img", "hr", "input"]);

/** Tags open and close in order; comments (Outlook's conditional ones too) are skipped. */
function unbalanced(html: string): string | null {
  const body = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<!DOCTYPE[^>]*>/i, "");
  const stack: string[] = [];
  for (const match of body.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9:]*)\b[^>]*?(\/?)>/g)) {
    const [, closing, rawName, selfClosing] = match;
    const name = rawName.toLowerCase();
    if (VOID.has(name) || selfClosing) continue;
    if (!closing) stack.push(name);
    else if (stack.pop() !== name) return `</${name}> at ${match.index}`;
  }
  return stack.length ? `unclosed <${stack.at(-1)}>` : null;
}

function cases() {
  return EMAIL_TEMPLATES.flatMap((entry) =>
    entry.locales.flatMap((locale) =>
      (entry.variants?.map((v) => v.id) ?? [undefined]).map((variant) => ({ entry, locale, variant })),
    ),
  );
}

describe("HDC email templates", () => {
  beforeEach(() => {
    sendMail.mockClear();
  });

  it("the catalogue lists every template file, and nothing that is not one", () => {
    expect(EMAIL_TEMPLATES.map((t) => t.id).sort()).toEqual(templateFiles());
  });

  it("every customer language has every word", () => {
    const keys = Object.keys(STRING_TABLES.el).sort();
    expect(Object.keys(STRING_TABLES.en).sort()).toEqual(keys);
    expect(Object.keys(STRING_TABLES.it).sort()).toEqual(keys);
  });

  it.each(cases().map((c) => [`${c.entry.id} ${c.locale}${c.variant ? ` (${c.variant})` : ""}`, c]))(
    "%s renders cleanly",
    async (_label, { entry, locale, variant }) => {
      const result = await previewEmail(entry.id, {
        locale,
        variant,
        assetOrigin: "https://milwaukeetoolshdc.gr",
        admin: { email: "admin@example.gr", name: "Γιάννης" },
      });
      if (!result.ok) throw new Error(result.error);
      const { html, text, subject, preheader } = result.email;

      expect(subject.trim().length).toBeGreaterThan(3);
      expect(preheader).not.toMatch(/undefined|\bnull\b|NaN/);
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain(`lang="${locale}"`);
      expect(html).not.toContain("{{");
      expect(html).not.toMatch(/undefined|\bnull\b|NaN|\[object /);
      expect(html).not.toMatch(/(href|src)=""/);
      expect(unbalanced(html)).toBeNull();

      // Pictures: never WebP (Outlook for Windows cannot show it).
      expect(html).not.toMatch(/\.webp/i);
      for (const [, src] of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
        expect(src).toMatch(/^https:\/\/milwaukeetoolshdc\.gr\/(api\/mail\/img\/\d+\/[A-Za-z0-9_-]+\.jpg|brand\/hdc-lockup-440\.png)$/);
      }

      // The plain-text part exists and carries the message.
      expect(text.length).toBeGreaterThan(80);
      expect(text).not.toMatch(/<[a-z]|&nbsp;|\{\{/i);

      // No «Kolleris» for the reader, except the @kolleris.com addresses.
      const visible = [text, subject, preheader, ...[...html.matchAll(/alt="([^"]*)"/g)].map((m) => m[1])]
        .join("\n")
        .replace(/[\w.+-]+@kolleris\.com/gi, "")
        .replace(/\(https?:\/\/[^)]*\)/g, "");
      expect(visible).not.toMatch(/kolleris/i);
      // Individuals only, and never a dealer.
      expect(visible).not.toMatch(/B2B|εξουσιοδοτημένος|αντιπρόσωπος|επαγγελματ/i);

      if (entry.locales.length === 1) expect(locale).toBe("el");
    },
  );

  it("the supplier variant says 3–5 working days", async () => {
    const result = await previewEmail("order-confirmation", {
      locale: "el",
      variant: "supplier",
      admin: { email: "admin@example.gr" },
    });
    expect(result.ok && result.email.text).toMatch(/ΠΑΡΑΔΟΣΗ ΣΕ 3–5 ΕΡΓΑΣΙΜΕΣ/);
  });

  it("amounts keep the thousands separator", async () => {
    const el = await previewEmail("order-confirmation", { locale: "el", admin: { email: "a@example.gr" } });
    const en = await previewEmail("order-confirmation", { locale: "en", admin: { email: "a@example.gr" } });
    expect(el.ok && el.email.text).toContain("1.092,89 €");
    expect(en.ok && en.email.text).toContain("€1,092.89");
  });

  it("links follow the reader's language", async () => {
    const result = await previewEmail("order-shipped", { locale: "it", admin: { email: "a@example.gr" } });
    expect(result.ok && result.email.html).toContain("/it/checkout/epibebaiosi/HDC-20260930-0012");
  });

  it("the footer links the HDC's own Facebook and Instagram, and no TikTok", async () => {
    const result = await previewEmail("nl-offers", { locale: "el", admin: { email: "a@example.gr" } });
    // Handlebars writes «=» in attributes as &#x3D;, which every client decodes.
    const html = (result.ok ? result.email.html : "").replaceAll("&#x3D;", "=");
    expect(html).toContain("https://www.facebook.com/profile.php?id=61585656644198");
    expect(html).toContain("https://www.instagram.com/hdc.kolleris_piraeus/");
    expect(html).not.toMatch(/tiktok\.com|kolleris_tools|kolleristools/i);
  });
});

describe("email pictures", () => {
  it("CDN pictures become JPEG through our route, and decode back", () => {
    const src = `${CDN}/4933478449/primary 0.webp`;
    const url = mailImageUrl(src, 340, "https://milwaukeetoolshdc.gr");
    expect(url).toMatch(/^https:\/\/milwaukeetoolshdc\.gr\/api\/mail\/img\/340\/[A-Za-z0-9_-]+\.jpg$/);
    expect(decodeMailImage(url.split("/").at(-1)!)).toBe(new URL(src).href);
  });

  it("a WebP from a host we do not proxy is dropped, not sent broken", () => {
    expect(mailImageUrl("https://example.com/a.webp", 340, "https://x.gr")).toBe("");
    expect(mailImageUrl("https://example.com/a.png", 340, "https://x.gr")).toBe("https://example.com/a.png");
  });

  it("the route refuses addresses outside our CDNs", () => {
    const evil = Buffer.from("https://169.254.169.254/latest").toString("base64url");
    expect(decodeMailImage(`${evil}.jpg`)).toBeNull();
    expect(decodeMailImage("../../etc/passwd")).toBeNull();
  });
});

describe("«Αποστολή δοκιμαστικού σε εμένα»", () => {
  beforeEach(() => {
    sendMail.mockClear();
  });

  it("sends the preview to the signed-in admin only, marked as a test", async () => {
    const { sendTemplateTestAction } = await import("@/app/admin/(protected)/email-templates/actions");
    const result = await sendTemplateTestAction({ id: "order-confirmation", locale: "en" });
    expect(result).toEqual({ ok: true, to: "admin@example.gr" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0] as { to: string; subject: string; html: string; text: string };
    expect(mail.to).toBe("admin@example.gr");
    expect(mail.subject).toMatch(/^\[ΔΟΚΙΜΗ\] Order HDC-20260930-0012 confirmed$/);
    expect(mail.text.length).toBeGreaterThan(80);
  });

  it("refuses an unknown template without sending", async () => {
    const { sendTemplateTestAction } = await import("@/app/admin/(protected)/email-templates/actions");
    expect(await sendTemplateTestAction({ id: "../x", locale: "el" })).toMatchObject({ ok: false });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
