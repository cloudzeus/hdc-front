import { upGreek } from "@/lib/greek";

/**
 * How the account area words an order (account.html, screens 2 and 3).
 *
 * The status chip is a word first and a colour second (a customer who cannot
 * tell the amber from the green still has to know whether their order
 * shipped): "ship" blue, "del" green, "pay" amber, "conf" black, "off" grey.
 * A delivered order collected from the shop reads «ΠΑΡΑΛΗΦΘΗΚΕ», not
 * «ΠΑΡΑΔΟΘΗΚΕ» — nobody delivered it.
 */

export type ChipKey =
  | "pending_payment"
  | "confirmed"
  | "shipped"
  | "ready"
  | "delivered"
  | "collected"
  | "cancelled"
  | "failed";

export type ChipTone = "pay" | "conf" | "ship" | "del" | "off";

export function statusChip(order: {
  status: string;
  shippingMethod: string;
}): { key: ChipKey; tone: ChipTone } {
  const pickup = order.shippingMethod === "pickup";
  switch (order.status) {
    case "PENDING_PAYMENT":
      return { key: "pending_payment", tone: "pay" };
    case "SHIPPED":
      return pickup ? { key: "ready", tone: "ship" } : { key: "shipped", tone: "ship" };
    case "DELIVERED":
      return pickup ? { key: "collected", tone: "del" } : { key: "delivered", tone: "del" };
    case "CANCELLED":
      return { key: "cancelled", tone: "off" };
    case "FAILED":
      return { key: "failed", tone: "off" };
    default:
      return { key: "confirmed", tone: "conf" };
  }
}

/** Orders still on their way to the customer. */
export const OPEN_STATUSES = ["PENDING_PAYMENT", "CONFIRMED", "SHIPPED"] as const;

/** The orders whose lines count as owned: paid for and not undone. */
export const OWNED_STATUSES = ["CONFIRMED", "SHIPPED", "DELIVERED"] as const;

/**
 * «ΠΕΛΑΤΗΣ ΑΠΟ ΑΥΓΟΥΣΤΟ 2026» — the month and year an account was opened, in
 * capitals without accents. Greek wants the accusative after «από», which for
 * the (all masculine, all -ος) month names is the nominative without its ς.
 */
export function customerSince(createdAt: Date | string, locale: string): string {
  const date = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const text = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Athens",
  }).format(date);
  return upGreek(locale === "el" ? text.replace(/ς(?=\s)/, "") : text);
}

/**
 * The manufacturer's article number for an order line — "4933478429", the
 * number on the box — read from the end of the ERP name; the line's own code
 * when the name has none.
 */
export function articleNumber(name: string, sku: string): string {
  const match = name.match(/(?:^|\s)(\d{10})(?=\s|$)/g);
  return match ? match[match.length - 1].trim() : sku;
}
