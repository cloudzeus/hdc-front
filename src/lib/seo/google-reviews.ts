import { siteId } from "@/lib/seo/site-ids";

/**
 * Google Customer Reviews.
 *
 * Two separate integrations that happen to share a merchant id:
 *
 *   the survey opt-in  — one script on the order confirmation page, which asks
 *                        the customer for permission to email them a survey
 *                        about this order once it should have arrived
 *   the badge          — a floating widget on every page showing the seller
 *                        rating those surveys produce
 *
 * The merchant id is not a secret — it is published in the page source of
 * every site running this, and it identifies one Merchant Center account.
 * Same reasoning as the Search Console verification token in `app/layout.tsx`:
 * making it a required deployment setting only adds a step to a chain that has
 * already dropped one. The environment variable still overrides, for a second
 * account or a staging property.
 */

/**
 * The Merchant Center account the survey opt-in reports to, or `undefined`.
 *
 * From NEXT_PUBLIC_MERCHANT_ID only. The fallback that used to be here
 * (5834747829) is the Kolleris account: on this shop it would have asked Google
 * to survey HDC customers on another merchant's behalf. Unset means no opt-in
 * is rendered. See src/lib/seo/site-ids.ts.
 */
export function merchantCenterAccount(): number | undefined {
  const id = siteId("merchantId");
  return id ? Number(id) : undefined;
}

/**
 * When the parcel should be with the customer, as `YYYY-MM-DD`.
 *
 * Google uses this to decide when to send the survey — too early and the
 * customer is asked about something that has not arrived, which is worse than
 * not asking. Derived from the same ACS zone table the checkout quotes from,
 * so the estimate the survey waits for is the estimate the customer was given.
 *
 * `etaDays` is a range like "2-4"; the upper bound is taken, then two days of
 * slack, because a survey that arrives a day late costs nothing and one that
 * arrives a day early costs a review.
 */
export function estimatedDeliveryDate(
  placedAt: Date,
  etaDays: string | null | undefined,
  shippingMethod: string,
): string {
  // Pickup has no delivery: ready in about two hours, so the survey may as
  // well go out on the next working day.
  if (shippingMethod === "pickup") return isoDate(addDays(placedAt, 1));

  const upperBound = Number((etaDays ?? "").split("-").pop()) || 3;
  return isoDate(addDays(placedAt, upperBound + 2));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Which catalogue rows an order's lines were, for their GTINs.
 *
 * By MTRL where the line has one; an XML-only product's line has none (it
 * travels by its XML code), so it is found by the product id kept on the line.
 */
export function orderedProductsWhere(
  lines: ReadonlyArray<{ mtrl: number | null; productId: string | null }>,
): { OR: Array<{ mtrl: { in: number[] } } | { id: { in: string[] } }> } | null {
  const mtrls = lines.flatMap((l) => (l.mtrl != null ? [l.mtrl] : []));
  const ids = lines.flatMap((l) => (l.mtrl == null && l.productId ? [l.productId] : []));
  const or = [
    ...(mtrls.length ? [{ mtrl: { in: mtrls } }] : []),
    ...(ids.length ? [{ id: { in: ids } }] : []),
  ];
  return or.length ? { OR: or } : null;
}
