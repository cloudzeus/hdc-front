import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => (await import("./request-fakes")).mockModules.prisma());
const { sendMail } = vi.hoisted(() => ({
  sendMail: vi.fn(async (mail: { to: string }) => {
    void mail;
    return { ok: true as const, id: "mg-1" };
  }),
}));
vi.mock("@/lib/mail/client", () => ({ sendMail, mailConfigured: () => true }));

import { TOKEN, resetFakes, seedRequest } from "./request-fakes";
import { sendInternalRequestEmail, sendRequestEmail } from "@/lib/mail/request-emails";

type SentMail = { to: string; subject: string; html: string; text: string; tracking?: boolean; replyTo?: string };
const lastMail = () => sendMail.mock.calls.at(-1)?.[0] as SentMail;

const ADDRESS = { shipLine1: "Ηρώων Πολυτεχνείου 45", shipLine2: null, shipCity: "Πειραιάς", wantsInvoice: false, notes: null };

const OFFER = {
  decision: "offer",
  version: 1,
  receivedAt: "2026-10-13T10:00:00.000Z",
  lines: [
    { kind: "original", replacesLineId: null, mtrl: 101, sku: "KN-1", name: "Πένσα", qty: 2, unitNet: 10, vatRate: 24, leadTimeText: null },
    { kind: "alternative", replacesLineId: "L2", mtrl: 109, sku: "KN-9", name: "Κόφτης Pro", qty: 1, unitNet: 22, vatRate: 24, leadTimeText: null },
    { kind: "alternative", replacesLineId: null, mtrl: 555, sku: "KN-X", name: "Θήκη", qty: 1, unitNet: 5, vatRate: 24, leadTimeText: null },
  ],
  removedLineIds: [],
  leadTimeText: "5–7 εργάσιμες",
  note: "Νέο μοντέλο",
  shippingNet: 4,
  quotedShippingNet: null,
  expiresAt: "2026-10-16T10:00:00.000Z",
};

beforeEach(() => {
  resetFakes();
  sendMail.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://milwaukeetoolshdc.gr");
});

describe("request emails (HDC)", () => {
  it("«received»: the private link, the 24-hour promise, tracking OFF", async () => {
    seedRequest(ADDRESS);
    expect(await sendRequestEmail("received", "HDC-20261013-0002")).toEqual({ ok: true, id: "mg-1" });
    const mail = lastMail();
    expect(mail.to).toBe("buyer@example.test");
    expect(mail.tracking).toBe(false);
    expect(mail.text).toContain("24");
    expect(mail.html).toContain(`/aitima/${TOKEN}`);
    expect(mail.html).toContain("Πένσα");
    expect(mail.html).not.toMatch(/undefined|\bnull\b|NaN/);
  });

  it("«offer» in the customer's language: comparison, «Προσθήκη» for an added product, total from the stored offer", async () => {
    seedRequest({
      ...ADDRESS,
      requestStatus: "OFFERED",
      offerVersion: 1,
      offerExpiresAt: new Date("2026-10-16T10:00:00Z"),
      offerJson: OFFER,
    });
    await sendRequestEmail("offer", "HDC-20261013-0002");
    const el = lastMail();
    expect(el.tracking).toBe(false);
    expect(el.html).toContain("Αντί για: Κόφτης");
    expect(el.html).toContain("ΠΡΟΣΘΗΚΗ");
    // 2×10 + 22 + 5 = 47 net → 58,28 gross + 4 net shipping (4,96) = 63,24
    expect(el.text.replace(/ /g, " ")).toContain("63,24 €");

    const order = (await import("./request-fakes")).db.orders[0];
    order.requestLines = { ...(order.requestLines as object), locale: "en" };
    await sendRequestEmail("offer", "HDC-20261013-0002");
    const en = lastMail();
    expect(en.subject).toBe("Our offer for request HDC-20261013-0002");
    expect(en.html).toContain(`/en/aitima/${TOKEN}`);
  });

  it("«rejected» carries the reason; «expired» and «reminder» go out with tracking off", async () => {
    seedRequest({
      ...ADDRESS,
      requestStatus: "REJECTED",
      offerJson: { decision: "reject", version: 1, receivedAt: "2026-10-13T10:00:00.000Z", reason: "Εκτός παραγωγής" },
    });
    await sendRequestEmail("rejected", "HDC-20261013-0002");
    expect(lastMail().html).toContain("Εκτός παραγωγής");
    await sendRequestEmail("expired", "HDC-20261013-0002");
    expect(lastMail().tracking).toBe(false);
  });

  it("no offer, no offer email", async () => {
    seedRequest(ADDRESS);
    expect(await sendRequestEmail("offer", "HDC-20261013-0002")).toMatchObject({ ok: false });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("internal email: to the shop, replies to the customer, links the admin and never the secret page", async () => {
    seedRequest(ADDRESS);
    await sendInternalRequestEmail("HDC-20261013-0002");
    const mail = lastMail();
    expect(mail.to).toContain("kolleris.com");
    expect(mail.replyTo).toBe("buyer@example.test");
    expect(mail.html).toContain("/admin/orders/HDC-20261013-0002");
    expect(mail.html).not.toContain(TOKEN);
  });
});
