import "server-only";
import { VatCheckLimiter } from "@/lib/eu-sales/vat-check-limit";

/**
 * The process-wide limiters for `checkVatForCheckout` (a "use server" module
 * may export only async functions). Two buckets, both must have room: one per
 * cart (10 / 10 min) and one per client IP (20 / 10 min) — the cart cookie
 * alone can be thrown away and replaced, the address cannot (R11-I3). The IP
 * bucket is wider so a few buyers behind one office NAT are not refused.
 */
export const vatChecks = new VatCheckLimiter();
export const VAT_CHECKS_PER_IP = 20;
export const vatChecksByIp = new VatCheckLimiter(VAT_CHECKS_PER_IP);
