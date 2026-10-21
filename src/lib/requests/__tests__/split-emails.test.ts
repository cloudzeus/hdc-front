import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A split cart in the emails, in both directions: the paid order's receipt
 * names the request that holds the rest of the basket (and its private link,
 * so tracking goes off), and the request's emails name the paid order with
 * its amount and postage. Real templates, fake database, fake Mailgun.
 */

vi.mock("@/lib/prisma", async () => (await import("./request-fakes")).mockModules.prisma());
const { sendMail } = vi.hoisted(() => ({
  sendMail: vi.fn(async (mail: { to: string }) => {
    void mail;
    return { ok: true as const, id: "mg-1" };
  }),
}));
vi.mock("@/lib/mail/client", () => ({ sendMail, mailConfigured: () => true }));

import { TOKEN, db, resetFakes, seedRequest } from "./request-fakes";
import { buildOrderEmail } from "@/lib/mail/order-email";
import { sendInternalOrderEmail } from "@/lib/mail/order-internal-email";
import { sendInternalRequestEmail, sendRequestEmail } from "@/lib/mail/request-emails";

type SentMail = { to: string; subject: string; html: string; text: string; tracking?: boolean };
const lastMail = () => sendMail.mock.calls.at(-1)?.[0] as SentMail;
/** Amounts carry non-breaking spaces; compare as plain spaces. */
const plain = (s: string) => s.replace(/ /g, " ");

const PAID = "HDC-20261013-0001";
const REQUEST = "HDC-20261013-0002";
const GUEST = "g".repeat(32);

const ADDRESS = {
  shipLine1: "Ηρώων Πολυτεχνείου 45",
  shipLine2: null,
  shipCity: "Πειραιάς",
  shipPostcode: "18536",
  shipCountry: "GR",
  wantsInvoice: false,
  notes: null,
};

function seedPaid(over: Record<string, unknown> = {}) {
  const order = {
    id: "p1",
    orderNumber: PAID,
    guestToken: GUEST,
    status: "CONFIRMED",
    paymentStatus: "PAID",
    paymentMethod: "card",
    shippingMethod: "courier",
    email: "buyer@example.test",
    phone: "6900000000",
    firstName: "Μαρία",
    lastName: "Παπαδοπούλου",
    ...ADDRESS,
    supplierOrder: false,
    subtotalNet: 100,
    subtotalGross: 124,
    shippingNet: 5,
    shippingGross: 6.2,
    paymentFeeNet: 0,
    paymentFeeGross: 0,
    vatAmount: 25.2,
    totalGross: 130.2,
    shippingQuote: { locale: "el", etaDays: 1 },
    reservedUntil: null,
    vivaOrderCode: null,
    paidAt: new Date("2026-10-13T08:05:00Z"),
    createdAt: new Date("2026-10-13T08:00:00Z"),
    requestStatus: null,
    requestToken: null,
    parentOrderNumber: null,
    offerVersion: null,
    offerExpiresAt: null,
    offerRemindedAt: null,
    ...over,
  };
  db.orders.push(order as never);
  db.lines.push({
    id: "pl1",
    orderId: "p1",
    productId: null,
    sku: "4933478449",
    name: "ΜΠΟΥΛΟΝΟΚΛΕΙΔΟ M18 FMTIW2F12-0X",
    brand: "MILWAUKEE",
    imageUrl: null,
    quantity: 1,
    unitNet: 100,
    discountPercent: 0,
    offerTitle: null,
    vatRate: 24,
    lineNet: 100,
    lineGross: 124,
  });
  return order;
}

beforeEach(() => {
  resetFakes();
  sendMail.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://milwaukeetoolshdc.gr");
});

describe("paid receipt → the request with the rest of the basket", () => {
  it("lists the requested items, their indicative value, the request number and its private link — tracking off", async () => {
    seedPaid();
    seedRequest({ parentOrderNumber: PAID, createdAt: new Date("2026-10-13T08:00:00Z"), ...ADDRESS });
    const built = await buildOrderEmail(PAID);
    expect(built).not.toBeNull();
    const html = plain(built!.email.html);
    expect(html).toContain("ΤΑ ΥΠΟΛΟΙΠΑ ΕΙΔΗ ΤΟΥ ΚΑΛΑΘΙΟΥ ΣΑΣ");
    expect(html).toContain(REQUEST);
    expect(html).toContain("Πένσα");
    // 2×10 + 1×20 net at 24% = 49,60 € indicative.
    expect(html).toContain("49,60 €");
    expect(html).toContain(`/aitima/${TOKEN}`);
    expect(html).toContain("δεύτερη αποστολή");
    expect(plain(built!.email.text)).toContain(REQUEST);
    expect(built!.tracking).toBe(false);
    // The amount charged is the paid half only.
    expect(html).toContain("130,20 €");
  });

  it("in English when the customer ordered in English", async () => {
    seedPaid({ shippingQuote: { locale: "en" } });
    seedRequest({ parentOrderNumber: PAID, createdAt: new Date("2026-10-13T08:00:00Z"), ...ADDRESS });
    const built = await buildOrderEmail(PAID);
    expect(built!.email.html).toContain("THE REST OF YOUR BASKET");
    expect(built!.email.html).toContain(`/en/aitima/${TOKEN}`);
  });

  it("the shop's copy names both numbers and never the customer's secret page", async () => {
    seedPaid();
    seedRequest({ parentOrderNumber: PAID, createdAt: new Date("2026-10-13T08:00:00Z"), ...ADDRESS });
    await sendInternalOrderEmail(PAID);
    const mail = lastMail();
    expect(mail.subject).toContain(PAID);
    expect(mail.subject).toContain(`αίτημα ${REQUEST}`);
    expect(plain(mail.html)).toContain(`το αίτημα ${REQUEST} (ενδεικτική αξία 49,60 €)`);
    expect(mail.html).not.toContain(TOKEN);
  });

  it("an ordinary order's receipt is unchanged: no split section, tracking as before", async () => {
    seedPaid();
    const built = await buildOrderEmail(PAID);
    expect(built!.email.html).not.toContain("ΥΠΟΛΟΙΠΑ ΕΙΔΗ");
    expect(built!.email.html).not.toContain("ΔΕΥΤΕΡΗ ΑΠΟΣΤΟΛΗ");
    expect(built!.tracking).toBeUndefined();
  });
});

describe("request emails → the paid order", () => {
  it("«received» at checkout: the paid order's number, amount and postage, still to pay; separate shipment", async () => {
    seedPaid({ paymentStatus: "PENDING", status: "PENDING_PAYMENT" });
    seedRequest({ parentOrderNumber: PAID, ...ADDRESS });
    await sendRequestEmail("received", REQUEST);
    const mail = lastMail();
    const html = plain(mail.html);
    expect(mail.tracking).toBe(false);
    expect(html).toContain(`Τα διαθέσιμα είδη του καλαθιού σας είναι η παραγγελία ${PAID}: 130,20 €`);
    expect(html).toContain("μεταφορικά 6,20 €");
    expect(html).toContain("που πληρώνετε τώρα");
    expect(html).toContain("δεύτερη αποστολή");
    expect(html).toContain("Μεταφορικά 2ης αποστολής");
    expect(plain(mail.text)).toContain(PAID);
  });

  it("«received» after the payment says it was paid", async () => {
    seedPaid();
    seedRequest({ parentOrderNumber: PAID, ...ADDRESS });
    await sendRequestEmail("received", REQUEST);
    expect(plain(lastMail().html)).toContain(`πληρώθηκαν στην παραγγελία ${PAID}: 130,20 €`);
  });

  it("«offer» for a split request: the second shipment, its shipping shown on its own", async () => {
    seedPaid();
    seedRequest({
      parentOrderNumber: PAID,
      ...ADDRESS,
      requestStatus: "OFFERED",
      offerVersion: 1,
      offerExpiresAt: new Date("2026-10-16T10:00:00Z"),
      offerJson: {
        decision: "offer",
        version: 1,
        receivedAt: "2026-10-13T10:00:00.000Z",
        lines: [{ kind: "original", replacesLineId: null, mtrl: 101, sku: "KN-1", name: "Πένσα", qty: 2, unitNet: 10, vatRate: 24, leadTimeText: null }],
        removedLineIds: ["L2"],
        leadTimeText: null,
        note: null,
        shippingNet: 4,
        quotedShippingNet: null,
        expiresAt: "2026-10-16T10:00:00.000Z",
      },
    });
    await sendRequestEmail("offer", REQUEST);
    const html = plain(lastMail().html);
    expect(html).toContain("δεύτερη αποστολή");
    expect(html).toContain(PAID);
    expect(html).toContain("Μεταφορικά 2ης αποστολής");
    expect(html).toContain("4,96 €");
  });

  it("a request on its own keeps its old words", async () => {
    seedRequest(ADDRESS);
    await sendRequestEmail("received", REQUEST);
    const html = plain(lastMail().html);
    expect(html).not.toContain("δεύτερη αποστολή");
    expect(html).not.toContain("2ης αποστολής");
  });

  it("the shop's request email names the paid half with its amount", async () => {
    seedPaid({ paymentStatus: "PENDING" });
    seedRequest({ parentOrderNumber: PAID, ...ADDRESS });
    await sendInternalRequestEmail(REQUEST);
    const mail = lastMail();
    expect(mail.subject).toContain(PAID);
    expect(plain(mail.html)).toContain(`η παραγγελία ${PAID} (130,20 €`);
    expect(mail.html).toContain("Εκκρεμεί πληρωμή");
  });
});

describe("an accepted request, paid: its receipt says it is the second shipment", () => {
  it("links the first order", async () => {
    seedPaid();
    seedRequest({
      parentOrderNumber: PAID,
      ...ADDRESS,
      requestStatus: "ACCEPTED",
      paymentStatus: "PAID",
      status: "CONFIRMED",
      guestToken: "h".repeat(32),
      createdAt: new Date("2026-10-13T08:00:00Z"),
      supplierOrder: false,
      subtotalGross: 49.6,
      shippingGross: 4.96,
      paymentFeeGross: 0,
      vatAmount: 10.56,
      shippingQuote: { locale: "el" },
    });
    for (const l of db.lines.filter((x) => x.orderId === "r1")) {
      Object.assign(l, { productId: null, name: "Πένσα", unitNet: 10, discountPercent: 0, vatRate: 24, lineNet: 10, lineGross: 12.4, brand: null, imageUrl: null, offerTitle: null });
    }
    const built = await buildOrderEmail(REQUEST);
    expect(built!.email.html).toContain("ΔΕΥΤΕΡΗ ΑΠΟΣΤΟΛΗ");
    expect(built!.email.html).toContain(PAID);
    expect(built!.email.html).toContain(`/checkout/epibebaiosi/${PAID}`);
    expect(built!.tracking).toBe(false);
  });
});
