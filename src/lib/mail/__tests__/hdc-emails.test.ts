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

process.env.AUTH_SECRET = "test-only-secret-for-image-signatures";
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
        realOrders: true,
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
        expect(src).toMatch(
          /^https:\/\/milwaukeetoolshdc\.gr\/(api\/mail\/img\/\d+\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}\.jpg|brand\/hdc-lockup-440\.png)$/,
        );
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
      realOrders: true,
      admin: { email: "admin@example.gr" },
    });
    expect(result.ok && result.email.text).toMatch(/ΠΑΡΑΔΟΣΗ ΣΕ 3–5 ΕΡΓΑΣΙΜΕΣ/);
  });

  it("amounts keep the thousands separator", async () => {
    const el = await previewEmail("order-confirmation", { locale: "el", realOrders: true, admin: { email: "a@example.gr" } });
    const en = await previewEmail("order-confirmation", { locale: "en", realOrders: true, admin: { email: "a@example.gr" } });
    expect(el.ok && el.email.text).toContain("1.092,89 €");
    expect(en.ok && en.email.text).toContain("€1,092.89");
  });

  it("without the orders permission the preview uses a sample order, no customer data", async () => {
    const result = await previewEmail("order-confirmation", { locale: "el", realOrders: false, admin: { email: "a@example.gr" } });
    if (!result.ok) throw new Error(result.error);
    expect(result.source).toMatch(/Δείγμα παραγγελίας/);
    expect(result.email.html).not.toContain(ORDER.email);
    expect(result.email.html).not.toContain(ORDER.orderNumber);
    expect(unbalanced(result.email.html)).toBeNull();
  });

  it("only the confirmation shows availability per line", async () => {
    const labels = /Σε απόθεμα|Τελευταίο τεμάχιο|Διαθέσιμο · 3–5|Παράδοση 1–3/;
    const show = async (id: string) => {
      const r = await previewEmail(id, { locale: "el", realOrders: true, admin: { email: "a@example.gr" } });
      if (!r.ok) throw new Error(r.error);
      return r.email.text;
    };
    expect(await show("order-confirmation")).toMatch(labels);
    for (const id of ["order-shipped", "order-delivered", "order-status", "payment-success", "internal-order", "review-request"]) {
      expect(await show(id)).not.toMatch(labels);
    }
  });

  it("links follow the reader's language", async () => {
    const result = await previewEmail("order-shipped", { locale: "it", realOrders: true, admin: { email: "a@example.gr" } });
    expect(result.ok && result.email.html).toContain("/it/checkout/epibebaiosi/HDC-20260930-0012");
  });

  it("the footer links the HDC's own Facebook and Instagram, and no TikTok", async () => {
    const result = await previewEmail("nl-offers", { locale: "el", realOrders: true, admin: { email: "a@example.gr" } });
    // Handlebars writes «=» in attributes as &#x3D;, which every client decodes.
    const html = (result.ok ? result.email.html : "").replaceAll("&#x3D;", "=");
    expect(html).toContain("https://www.facebook.com/profile.php?id=61585656644198");
    expect(html).toContain("https://www.instagram.com/hdc.kolleris_piraeus/");
    expect(html).not.toMatch(/tiktok\.com|kolleris_tools|kolleristools/i);
  });
});

const lastSegment = (url: string) => url.split("/").at(-1)!;

describe("email pictures", () => {
  it("CDN pictures become signed JPEG addresses on our route, and decode back", () => {
    const src = `${CDN}/4933478449/primary 0.webp`;
    const url = mailImageUrl(src, 340, "https://milwaukeetoolshdc.gr");
    expect(url).toMatch(/^https:\/\/milwaukeetoolshdc\.gr\/api\/mail\/img\/340\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}\.jpg$/);
    expect(decodeMailImage(lastSegment(url), 340)).toBe(new URL(src).href);
  });

  it("an address without our signature, or signed for another width, is refused", () => {
    const url = mailImageUrl(`${CDN}/a.webp`, 340, "https://x.gr");
    const [b64] = lastSegment(url).split(".");
    expect(decodeMailImage(`${b64}.jpg`, 340)).toBeNull();
    expect(decodeMailImage(`${b64}.${"A".repeat(22)}.jpg`, 340)).toBeNull();
    expect(decodeMailImage(lastSegment(url), 600)).toBeNull();
  });

  it("a CDN address with a query, fragment, port or credentials is not proxied", () => {
    for (const src of [`${CDN}/a.webp?x=1`, `${CDN}/a.webp#x`, "https://kolleris.b-cdn.net:8443/a.webp", "https://u:p@kolleris.b-cdn.net/a.webp"]) {
      expect(mailImageUrl(src, 340, "https://x.gr")).toBe("");
    }
  });

  it("a WebP from a host we do not proxy is dropped, not sent broken", () => {
    expect(mailImageUrl("https://example.com/a.webp", 340, "https://x.gr")).toBe("");
    expect(mailImageUrl("https://example.com/a.png", 340, "https://x.gr")).toBe("https://example.com/a.png");
  });

  it("the route refuses addresses outside our CDNs", () => {
    const evil = Buffer.from("https://169.254.169.254/latest").toString("base64url");
    expect(decodeMailImage(`${evil}.${"A".repeat(22)}.jpg`, 340)).toBeNull();
    expect(decodeMailImage("../../etc/passwd", 340)).toBeNull();
  });

  it("a picture that resolves to nothing leaves no empty src or href", async () => {
    const { renderCampaignEmail } = await import("@/lib/newsletter/campaign");
    const bad = "https://example.com/picture.webp";
    const email = renderCampaignEmail("nl-offers", {
      campaign: { eyebrow: "E", discount: "-10%", title: "T", text: "X", url: "", valid_until: "", image: bad },
      products: [
        { id: "1", slug: "s", name: "M18 FUEL ΔΡΑΠΑΝΟ", code: "1", brand: "", image: bad, price: "1 €", priceOld: "", discount: "", stockLabel: "", url: "https://x.gr/p" },
      ],
    });
    expect(email.html).not.toMatch(/(src|href)=""/);
    expect(email.html).not.toContain("<img class=\"card-img\"");

    const news = renderCampaignEmail("nl-news", {
      campaign: { eyebrow: "", discount: "", title: "", text: "", url: "", valid_until: "" },
      products: [],
      news: {
        issue: { label: "N", number: "", title: "Τίτλος", intro: "" },
        hero: { eyebrow: "", title_before: "Hero", title_accent: "", title_after: "", text: "", image: bad, image_alt: "", cta: "Go", url: "" },
        articles: [{ id: "a", title: "A", excerpt: "", tag: "", image: bad, url: "", cta: "" }],
      },
    });
    expect(news.html).not.toMatch(/(src|href)=""/);

    const original = ORDER.lines[0].imageUrl;
    ORDER.lines[0].imageUrl = bad;
    try {
      const order = await previewEmail("order-confirmation", { locale: "el", realOrders: true, admin: { email: "a@example.gr" } });
      expect(order.ok && order.email.html).not.toMatch(/(src|href)=""/);
    } finally {
      ORDER.lines[0].imageUrl = original;
    }
  });
});

describe("/api/mail/img", () => {
  const route = () => import("@/app/api/mail/img/[w]/[file]/route");
  const call = async (w: string, file: string) =>
    (await route()).GET(new Request("https://x.gr/"), { params: Promise.resolve({ w, file }) });

  it("answers 404 without a valid signature, and never fetches", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const b64 = Buffer.from(`${CDN}/a.webp`).toString("base64url");
      expect((await call("340", `${b64}.jpg`)).status).toBe(404);
      expect((await call("340", `${b64}.${"A".repeat(22)}.jpg`)).status).toBe(404);
      expect((await call("999", `${b64}.jpg`)).status).toBe(404);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("follows no redirect and refuses a body declared over 10 MB", async () => {
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.redirect).toBe("error");
      return new Response("x", {
        headers: { "content-type": "image/webp", "content-length": String(11 * 1024 * 1024) },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const url = mailImageUrl(`${CDN}/too-big-${Date.now()}.webp`, 144, "https://x.gr");
      expect((await call("144", lastSegment(url))).status).toBe(404);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
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
