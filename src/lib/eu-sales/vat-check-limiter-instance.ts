import "server-only";
import { VatCheckLimiter } from "@/lib/eu-sales/vat-check-limit";

/** The process-wide limiter for `checkVatForCheckout` (a "use server" module may export only async functions). */
export const vatChecks = new VatCheckLimiter();
