"use server";

import { z } from "zod";
import { getCartToken } from "@/lib/cart/cart";
import { readEuBuyer, writeEuBuyer, type StoredBuyer } from "@/lib/eu-sales/buyer-cookie";
import { isDhlDestination, normalizeEuSalesCountry } from "@/lib/eu-sales/countries";
import { isEuSalesEnabled } from "@/lib/eu-sales/flag";
import { checkEuVat, type EuVatStatus } from "@/lib/eu-sales/hdctool-eu";
import { normaliseEuVat } from "@/lib/eu-sales/vat-format";
import { athensDay } from "@/lib/eu-sales/vat-mode";
import { headers } from "next/headers";
import { vatChecks, vatChecksByIp } from "@/lib/eu-sales/vat-check-limiter-instance";
import { clientIp } from "@/lib/security/client-ip";

/**
 * The checkout's «Έλεγχος» (and blur) for a foreign company's VAT number,
 * and the «Ιδιώτης / Εταιρεία» switch (spec 2026-10-23 §3.2).
 *
 * Asks VIES through HDCtool and remembers the answer in an httpOnly cookie
 * (`buyer-cookie`); setting it re-renders the checkout, so the summary drops
 * to net on a valid answer — and back to VAT the moment the customer picks
 * «Ιδιώτης» or another country. The display only: `placeOrder` asks again.
 *
 * At most 10 VIES checks per cart in 10 minutes. A wrong format is answered
 * here without asking anybody.
 */
export type CheckoutVatResult = {
  /** null: nothing to check (individual, no number yet, Greece, flag off). */
  status: EuVatStatus | "rate_limited" | null;
  /** The name VIES gave, for «Επιβεβαιώθηκε στο VIES: …». Never «---». */
  name: string | null;
  /** The number as it was checked («DE123456789»). */
  vat: string | null;
};

const inputSchema = z.object({
  country: z.string().trim().max(2),
  customerType: z.enum(["individual", "company"]),
  vat: z.string().trim().max(40).optional(),
});

const nothing: CheckoutVatResult = { status: null, name: null, vat: null };

function viesText(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text && text !== "---" ? text : null;
}

export async function checkVatForCheckout(input: unknown): Promise<CheckoutVatResult> {
  if (!isEuSalesEnabled()) return nothing;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return nothing;

  const country = normalizeEuSalesCountry(parsed.data.country);
  if (!country || !isDhlDestination(country)) {
    // Greece (or nothing we sell to): no buyer abroad, no exemption.
    await writeEuBuyer(null);
    return nothing;
  }

  if (parsed.data.customerType === "individual") {
    await writeEuBuyer({ country, customerType: "individual", vat: null, vies: null });
    return nothing;
  }

  const raw = parsed.data.vat ?? "";
  if (!raw.trim()) {
    await writeEuBuyer({ country, customerType: "company", vat: null, vies: null });
    return nothing;
  }

  const format = normaliseEuVat(raw, country);
  if (!format.ok) {
    await writeEuBuyer({
      country,
      customerType: "company",
      vat: null,
      vies: { status: "invalid_format", name: null, consultationNumber: null, checkedAt: null },
    });
    return { status: "invalid_format", name: null, vat: null };
  }

  /* The same number, same country, already valid today: no second call. */
  const stored = await readEuBuyer();
  if (
    stored?.country === country &&
    stored.vat === format.vat &&
    stored.vies?.status === "valid" &&
    stored.vies.checkedAt &&
    athensDay(new Date(stored.vies.checkedAt)) === athensDay(new Date())
  ) {
    await writeEuBuyer({ ...stored, customerType: "company" });
    return { status: "valid", name: stored.vies.name, vat: format.vat };
  }

  /*
   * Keyed on the cart AND the client address (R11-I3): a new cart cookie does
   * not buy new checks. `clientIp` is the proxy's peer (Cloudflare-aware,
   * IPv6 cut to its /64), never what the client wrote; with no address at all
   * (local runs) only the cart bucket applies.
   */
  const token = await getCartToken();
  const ip = clientIp(await headers());
  if (!token || !vatChecks.take(`cart:${token}`) || (ip != null && !vatChecksByIp.take(`ip:${ip}`))) {
    await writeEuBuyer({ country, customerType: "company", vat: format.vat, vies: null });
    return { status: "rate_limited", name: null, vat: format.vat };
  }

  let answer: Awaited<ReturnType<typeof checkEuVat>>;
  try {
    answer = await checkEuVat(format.vat, country);
  } catch (error) {
    // HDCtool refused OUR request (400/401): charged with VAT, never a crash.
    console.error("[eu-sales] VIES check failed at checkout", error);
    answer = { status: "unavailable", name: null, consultationNumber: null, checkedAt: null, message: "" };
  }

  const buyer: StoredBuyer = {
    country,
    customerType: "company",
    vat: format.vat,
    vies: {
      status: answer.status,
      name: viesText(answer.name),
      consultationNumber: viesText(answer.consultationNumber),
      checkedAt: answer.checkedAt,
    },
  };
  await writeEuBuyer(buyer);
  return { status: answer.status, name: buyer.vies!.name, vat: format.vat };
}
