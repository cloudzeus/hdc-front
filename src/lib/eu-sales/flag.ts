/**
 * EU_SALES_ENABLED — the switch for selling to the rest of the EU with DHL:
 * the country field at checkout, «Ιδιώτης / Εταιρεία», the VIES check and the
 * intra-EU VAT exemption (spec 2026-10-23 §7).
 *
 * On only for the exact string "true"; unset means the checkout is exactly
 * today's. Read on the server at call time — pages pass the answer down as a
 * prop and `placeOrder` reads it again and is the one that decides.
 */
export function isEuSalesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.EU_SALES_ENABLED === "true";
}
