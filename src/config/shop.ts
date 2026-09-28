/**
 * Who this shop is. One place, so the Kolleris eshop this was copied from
 * cannot leak back in through a forgotten literal.
 *
 * The brand is fixed: this shop sells Milwaukee and nothing else (spec §1).
 * The company that runs it is Kolleris — that belongs in the legal footer, not
 * in the shop's name.
 */
export const SHOP = {
  name: "Milwaukee Heavy Duty Centre",
  /** HDCtool MTRMARK of the only brand this shop sells. */
  mtrmark: 1364,
  /** HDC-YYYYMMDD-NNNN — HDCtool routes and reconciles orders by this prefix. */
  orderPrefix: "HDC-",
  /** Every cookie this shop sets starts with this, never KOLLERIS_. */
  cookiePrefix: "HDC_",

  /**
   * How to reach the shop: footer, store band, contact page, checkout header,
   * JSON-LD. Change them here and nowhere else. Source: the previous HDC site
   * (docs/content/milwaukeetoolshdc-pages.md), hours as decided by the client.
   */
  contact: {
    /** In the order they are printed; the first is the primary line. */
    phones: [
      { display: "+30 210 422 02 39", e164: "+302104220239" },
      { display: "+30 210 411 37 54", e164: "+302104113754" },
      { display: "+30 210 413 14 90", e164: "+302104131490" },
      { display: "+30 694 081 63 38", e164: "+306940816338" },
    ],
    /** General enquiries. */
    email: "info@kolleris.com",
    /** Orders and payments. */
    ordersEmail: "accounts@kolleris.com",
    street: "Κ. Μαυρομιχάλη 4",
    /** Five digits, as the checkout and the courier want it. */
    postcode: "18545",
    city: "Πειραιάς",
    /** As printed. */
    address: "Κ. Μαυρομιχάλη 4, 185 45 Πειραιάς",
    /**
     * Opening hours, Europe/Athens. `null` = closed all day. The day names
     * come from the message files; the open/closed logic is
     * src/lib/contact/hours.ts.
     */
    hours: {
      weekdays: { open: "08:00", close: "16:00" },
      saturday: { open: "09:00", close: "14:00" },
      sunday: null,
    },
  },

  /**
   * The company that operates the shop, for the legal line in the footer.
   * It operates the HDC; it is not presented as a dealer or agent.
   */
  operator: {
    name: "ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ",
    vat: "099095556",
    gemi: "44598907000",
  },
} as const;

/** The line printed first and dialled from every "call us" button. */
export const PRIMARY_PHONE = SHOP.contact.phones[0];

