/**
 * EAN-8/12/13/14 check digit. The one rule that turns a code into an
 * identifier: 219 of 5.307 `code1` values fail it, and a wrong GTIN is a
 * disapproval (feed) or a false identity (JSON-LD) where an absent one is fine.
 * One rule for the Merchant feed and the product page.
 */
export function isValidGtin(raw: string | null | undefined): boolean {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return false;

  const body = digits.split("").map(Number);
  const check = body.pop()!;
  let sum = 0;
  // Weights alternate 3 and 1, starting at 3 from the rightmost body digit.
  for (let i = body.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += body[i]! * weight;
  }
  return (10 - (sum % 10)) % 10 === check;
}

