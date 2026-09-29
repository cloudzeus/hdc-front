/**
 * The ids an order line carries to HDCtool.
 *
 * Αρνητικό mtrl = προϊόν μόνο-XML· ταξιδεύει με τον κωδικό του XML και κενό
 * MTRL, και το HDCtool κρατά την έκδοση μέχρι να δημιουργηθεί το είδος.
 */
export function orderLineIds(
  ids: { mtrl: number; xmlCode: string | null } | undefined,
): { mtrl: number | null; xmlCode: string | null } {
  return {
    mtrl: ids?.mtrl != null && ids.mtrl > 0 ? ids.mtrl : null,
    xmlCode: ids?.mtrl != null && ids.mtrl < 0 ? ids.xmlCode ?? null : null,
  };
}
