/**
 * The four-step timeline on the order confirmation (checkout.html, screen 3):
 * ΚΑΤΑΧΩΡΗΘΗΚΕ · ΠΛΗΡΩΘΗΚΕ · ΣΕ ΠΡΟΕΤΟΙΜΑΣΙΑ · ΣΤΑΛΘΗΚΕ.
 *
 * Read from the order's real status and payment status — never assumed from
 * the method. A card order the customer abandoned at Viva is not "paid"; a
 * bank transfer is placed and reserved, and waits for the money.
 *
 * `done` steps are green, the one `now` step is red, the rest grey. A failed
 * or cancelled order stops at the payment step, marked `failed`.
 */
export type TimelineStep = {
  key: "placed" | "paid" | "preparing" | "shipped";
  state: "done" | "now" | "todo" | "failed";
};

export function orderTimeline(order: {
  status: string;
  paymentStatus: string;
}): TimelineStep[] {
  const shipped = order.status === "SHIPPED" || order.status === "DELIVERED";
  const paid = order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED" || shipped;
  const stopped =
    order.status === "FAILED" ||
    order.status === "CANCELLED" ||
    order.paymentStatus === "FAILED";

  if (stopped) {
    return [
      { key: "placed", state: "done" },
      { key: "paid", state: paid ? "done" : "failed" },
      { key: "preparing", state: "todo" },
      { key: "shipped", state: "todo" },
    ];
  }

  return [
    { key: "placed", state: "done" },
    { key: "paid", state: paid ? "done" : "now" },
    { key: "preparing", state: shipped ? "done" : paid ? "now" : "todo" },
    { key: "shipped", state: shipped ? "done" : "todo" },
  ];
}
