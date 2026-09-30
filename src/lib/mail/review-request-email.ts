import "server-only";
import { renderEmail, localeUrl } from "@/lib/mail/hdc/render";
import { t } from "@/lib/mail/hdc/strings";
import { renderAndDeliver } from "@/lib/mail/hdc/deliver";
import { buildOrderView, loadOrder, orderLocale } from "@/lib/mail/hdc/order-view";
import type { MailOptions } from "@/lib/mail/order-email";

/**
 * «How did they work?» — seven days after delivery, once.
 *
 * Only to someone who can actually review: the review form needs a login, so a
 * guest order gets nothing — every link would end at a sign-in form. And only
 * for products still in the catalogue, once per product: two sizes of the same
 * code are two lines and one review.
 *
 * No one-click 1–5 scale: nothing would record it, and five buttons that do
 * nothing make the reader believe they rated.
 */

export async function buildReviewRequestEmail(
  orderNumber: string,
  options: MailOptions & { preview?: boolean } = {},
) {
  const order = await loadOrder(orderNumber);
  if (!order) return null;
  // The admin preview may show it for a guest order; a real send never goes to one.
  if (!order.customerId && !options.preview) return null;
  const locale = options.locale ?? orderLocale(order);
  const view = await buildOrderView(order, locale, { prices: false });
  const reviewsUrl = localeUrl(locale, "/logariasmos/axiologiseis");

  const seen = new Set<string>();
  const items = order.lines
    .map((line, i) => ({ line, item: view.items[i] }))
    .filter(({ line }) => {
      if (!line.productId || seen.has(line.productId)) return false;
      seen.add(line.productId);
      return true;
    })
    .map(({ item }) => ({
      ...item,
      qty: item.qty,
      availability: null,
      total: "",
      action: { label: t(locale, "review.action"), href: reviewsUrl },
    }));
  if (items.length === 0) return null;

  const email = renderEmail({
    template: "review-request",
    locale,
    kind: "order",
    subject: t(locale, "review.subject", { number: order.orderNumber }),
    preheader: t(locale, "review.pre"),
    topline: { left: t(locale, "review.topline"), right: order.orderNumber },
    assetOrigin: options.assetOrigin,
    data: { order: { number: order.orderNumber, items }, review: { url: reviewsUrl } },
  });
  return { to: order.email, email };
}

export async function sendReviewRequestEmail(orderNumber: string) {
  return renderAndDeliver(
    () => buildReviewRequestEmail(orderNumber),
    `review-request ${orderNumber}`,
    "Παραγγελία χωρίς λογαριασμό ή χωρίς προϊόν που να αξιολογείται.",
  );
}
