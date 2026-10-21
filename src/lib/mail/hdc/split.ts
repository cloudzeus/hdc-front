import "server-only";
import type { Locale } from "@/i18n/routing";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/format";
import { displayName } from "@/lib/milwaukee/display";
import { t } from "@/lib/mail/hdc/strings";
import { localeUrl } from "@/lib/mail/hdc/render";
import { adminOrderUrl, orderUrl } from "@/lib/mail/hdc/order-view";
import { REQUEST_ANSWER_HOURS, priceLines, readSnapshot, requestPath } from "@/lib/requests/model";

/**
 * A split cart, in the order emails (docs/backorder-requests.md §1).
 *
 * The in-stock half is paid and shipped as one order; the rest is a
 * back-order request with `parentOrderNumber` = that order. The receipt says
 * so in its own section — which items, their indicative value, the request
 * number and its page, and that they ship separately with their own postage,
 * confirmed in the offer — so the customer never wonders why the amount
 * charged is smaller than the basket was. An ACCEPTED request, once paid, is
 * an order too: its receipt says it is the second shipment.
 *
 * `customer` links to the request's private page (the token is the
 * credential: the email then goes with Mailgun tracking off); `internal`
 * names the other number and links nothing secret.
 */
export type SplitView = {
  title: string;
  lead: string;
  paragraphs: string[];
  items_title: string;
  items_aside: string;
  items: Array<{ tag: string; name: string; code: string; detail: string; total: string; struck: boolean; was: string }>;
  totals: Array<{ label: string; value: string }>;
  value_label: string;
  value: string;
  url: string;
  link_label: string;
  /** The other half's number, for subjects. */
  number: string;
  /** This order is the request's parent (true) or the accepted request (false). */
  parentSide: boolean;
  /** The url carries a secret (request token or guest token). */
  secret: boolean;
};

export async function splitView(
  order: { orderNumber: string; parentOrderNumber: string | null },
  locale: Locale,
  audience: "customer" | "internal",
): Promise<SplitView | null> {
  const money = (n: number) => formatMoney(n, locale);

  const child = await prisma.order.findFirst({
    where: { parentOrderNumber: order.orderNumber, requestStatus: { not: null } },
    select: { orderNumber: true, requestToken: true, requestLines: true },
  });
  const snapshot = child ? readSnapshot(child.requestLines) : null;
  if (child && snapshot) {
    const lines = snapshot.lines;
    const priced = priceLines(lines, 0);
    const value = money(priced.subtotalGross);
    const customer = audience === "customer";
    const url = customer
      ? child.requestToken
        ? localeUrl(locale, requestPath("el", child.requestToken))
        : ""
      : adminOrderUrl(child.orderNumber);
    return {
      title: customer ? t(locale, "split.title") : t("el", "internal.split_title"),
      lead: customer
        ? t(locale, "split.lead", { number: child.orderNumber, hours: REQUEST_ANSWER_HOURS })
        : t("el", "internal.split_child", { number: child.orderNumber, value }),
      paragraphs: customer ? [t(locale, "split.separate")] : [],
      items_title: t(locale, "split.items"),
      items_aside: t(locale, "order.prices_gross"),
      items: lines.map((line, i) => ({
        tag: "",
        name: displayName(line.name, line.sku),
        code: line.sku,
        detail: t(locale, "req.qty", { qty: line.qty }),
        total: money(priced.lines[i]?.lineGross ?? 0),
        struck: false,
        was: "",
      })),
      totals: [{ label: t(locale, "split.shipping"), value: t(locale, "req.shipping_later") }],
      value_label: t(locale, "req.indicative"),
      value,
      url,
      link_label: customer ? t(locale, "split.view", { number: child.orderNumber }) : t("el", "internal.admin"),
      number: child.orderNumber,
      parentSide: true,
      secret: customer && url !== "",
    };
  }

  if (order.parentOrderNumber) {
    const parent = await prisma.order.findUnique({
      where: { orderNumber: order.parentOrderNumber },
      select: { orderNumber: true, guestToken: true, totalGross: true },
    });
    if (!parent) return null;
    const customer = audience === "customer";
    const total = money(Number(parent.totalGross));
    return {
      title: customer ? t(locale, "split.second_title") : t("el", "internal.split_title"),
      lead: customer
        ? t(locale, "split.second_lead", { number: parent.orderNumber, total })
        : t("el", "internal.split_parent", { number: parent.orderNumber, total }),
      paragraphs: [],
      items_title: "",
      items_aside: "",
      items: [],
      totals: [],
      value_label: "",
      value: "",
      url: customer ? orderUrl(locale, parent) : adminOrderUrl(parent.orderNumber),
      link_label: customer ? t(locale, "split.view_parent", { number: parent.orderNumber }) : t("el", "internal.admin"),
      number: parent.orderNumber,
      parentSide: false,
      secret: customer,
    };
  }
  return null;
}
