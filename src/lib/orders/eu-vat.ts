/**
 * How an order's VAT was charged, read from the columns checkout froze
 * (`vatMode`, `billCountry`). Pure and client-safe: the intake payload, the
 * emails and the confirmation page all ask here, so none of them has its own
 * idea of what «exempt» means.
 *
 * `vatMode` is "intra_eu_exempt" only when `placeOrder` got a valid VIES answer
 * of the same Athens day for a company in another EU country. Orders placed
 * before EU sales have no such column value and read as standard.
 */
export function isIntraEuExempt(order: { vatMode?: string | null }): boolean {
  return order.vatMode === "intra_eu_exempt";
}

/** Billed to another country. Greek orders (and every order that predates EU sales) are not. */
export function isForeignBilling(order: { billCountry?: string | null }): boolean {
  const country = order.billCountry?.trim().toUpperCase();
  return !!country && country !== "GR";
}
