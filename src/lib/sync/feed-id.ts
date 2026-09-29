/**
 * Ένα id του καναλιού HDCtool: MTRL του SoftOne (θετικό) ή προϊόν μόνο-XML
 * (αρνητικό, `-feedSeq`). Το μηδέν δεν είναι id.
 */
export function isFeedId(value: unknown): value is number {
  return Number.isInteger(value) && value !== 0;
}

/**
 * Έχει η απάντηση έστω ένα MTRL του ERP;
 *
 * Ο φύλακας «κενή απάντηση» της reconcile μετρά μόνο αυτά: τα αρνητικά ids του
 * XML έρχονται στην πρώτη σελίδα ούτως ή άλλως, και αν μετρούσαν, μια σελίδα
 * ERP που ήρθε κενή από σφάλμα θα περνούσε τον φύλακα και θα απέσυρε όλο τον
 * κατάλογο του ERP.
 */
export function hasErpIds(ids: Iterable<number>): boolean {
  for (const id of ids) if (Number.isInteger(id) && id > 0) return true;
  return false;
}
