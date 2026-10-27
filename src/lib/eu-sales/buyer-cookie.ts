import "server-only";
import { cookies } from "next/headers";
import { SHOP } from "@/config/shop";
import { isDhlDestination } from "@/lib/eu-sales/countries";
import { isEuSalesEnabled } from "@/lib/eu-sales/flag";
import type { EuVatStatus } from "@/lib/eu-sales/hdctool-eu";
import type { CustomerType } from "@/lib/eu-sales/vat-mode";

/**
 * The buyer abroad as the checkout last told the server (EU_SALES_ENABLED):
 * «Ιδιώτης / Εταιρεία», and for a company the VAT number and what VIES said.
 *
 * Written only by the `checkVatForCheckout` server action, httpOnly, so the
 * page around the form can re-render the summary without VAT once VIES says
 * valid — setting a cookie in a Server Action re-renders the page. It decides
 * the DISPLAY only: `placeOrder` never reads it and asks VIES again.
 */
export const EU_BUYER_COOKIE = `${SHOP.cookiePrefix}EUB`;

export type StoredBuyer = {
  country: string;
  customerType: CustomerType;
  /** Normalised, with the prefix («DE123456789»). */
  vat: string | null;
  vies: {
    status: EuVatStatus;
    name: string | null;
    consultationNumber: string | null;
    checkedAt: string | null;
  } | null;
};

const STATUSES: readonly EuVatStatus[] = ["valid", "invalid", "unavailable", "invalid_format"];
const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** Pure, for the tests: the cookie's value back into a buyer, or null. */
export function parseBuyer(value: string | null | undefined): StoredBuyer | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    const country = typeof raw.country === "string" ? raw.country.toUpperCase() : "";
    if (!isDhlDestination(country)) return null;
    const customerType = raw.customerType === "company" ? "company" : "individual";
    const v = (raw.vies ?? null) as Record<string, unknown> | null;
    const status = STATUSES.find((s) => s === v?.status);
    return {
      country,
      customerType,
      vat: customerType === "company" ? str(raw.vat, 32) : null,
      vies:
        customerType === "company" && v && status
          ? {
              status,
              name: str(v.name, 255),
              consultationNumber: str(v.consultationNumber, 64),
              checkedAt: str(v.checkedAt, 40),
            }
          : null,
    };
  } catch {
    return null;
  }
}

export async function readEuBuyer(): Promise<StoredBuyer | null> {
  if (!isEuSalesEnabled()) return null;
  const store = await cookies();
  return parseBuyer(store.get(EU_BUYER_COOKIE)?.value);
}

/** Null forgets it (Greece chosen again). */
export async function writeEuBuyer(buyer: StoredBuyer | null): Promise<void> {
  const store = await cookies();
  if (!buyer) {
    store.delete(EU_BUYER_COOKIE);
    return;
  }
  store.set(EU_BUYER_COOKIE, JSON.stringify(buyer), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // A VIES answer counts for the day it was given; a day is enough.
    maxAge: 60 * 60 * 24,
  });
}
