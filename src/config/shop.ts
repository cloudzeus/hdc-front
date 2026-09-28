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
   * How to reach the shop — footer, and anything else that prints it.
   *
   * PLACEHOLDERS: these are still the Kolleris store's details, pending the
   * HDC's own phone, mailbox and hours. Change them here and nowhere else.
   */
  contact: {
    /** As printed. */
    phone: "210 411 1355",
    /** For `tel:` links. */
    phoneE164: "+302104111355",
    email: "info@kolleris.com",
    street: "Κ. Μαυρομιχάλη 4",
    postcode: "18545",
    city: "Πειραιάς",
    /** Monday to Friday; the day names come from the message files. */
    hours: { open: "08:00", close: "17:00" },
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
