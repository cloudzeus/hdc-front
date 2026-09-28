import "server-only";
import { prisma } from "@/lib/prisma";
import { hasProvenEmail } from "@/lib/account/email-proof";
import {
  customerOrderWhere,
  ORDER_ROW_SELECT,
  toOrderRow,
  type OrderRowData,
} from "@/lib/account/dashboard";

/**
 * A customer's own orders.
 *
 * Matched on `customerId` OR the account's email, and that is not belt-and-
 * braces. The checkout only started stamping `customerId` today, so every order
 * placed before now is orphaned; and people order as a guest first and register
 * afterwards, which is the normal way an account begins. Matching on email as
 * well is what makes those orders appear instead of vanishing.
 *
 * The email comparison is case-insensitive because an address typed at checkout
 * and one typed at registration are the same address whatever the shift key was
 * doing.
 *
 * The email match applies only once the account has proven its address (see
 * `hasProvenEmail`). Direct registration does not check the email, and matching
 * on it regardless handed a stranger's guest orders to whoever registered with
 * their address first.
 */

/** The orders page: every order, newest first, as rows. */
export async function listCustomerOrders(
  customerId: string,
  email: string,
): Promise<OrderRowData[]> {
  const orders = await prisma.order.findMany({
    where: await customerOrderWhere(customerId, email),
    orderBy: { createdAt: "desc" },
    // Bounded. An account with hundreds of orders needs paging, not a longer
    // page, and nobody has hundreds yet.
    take: 50,
    select: ORDER_ROW_SELECT,
  });
  return orders.map(toOrderRow);
}

/** Everything the order page (account.html, screen 3) shows. */
export type AccountOrderDetail = {
  orderNumber: string;
  guestToken: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  shippingMethod: string;
  createdAt: Date;
  paidAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  shipLine1: string;
  shipLine2: string | null;
  shipPostcode: string;
  shipCity: string;
  acsVoucherNo: string | null;
  wantsInvoice: boolean;
  companyName: string | null;
  vatNumber: string | null;
  /** The document number SoftOne gave it — «ΠΑΡΚ000123» — once issued. */
  documentNo: string | null;
  subtotalGross: number;
  shippingGross: number;
  paymentFeeGross: number;
  vatAmount: number;
  totalGross: number;
  lines: Array<{
    id: string;
    name: string;
    sku: string;
    quantity: number;
    lineGross: number;
    imageUrl: string | null;
    vatRate: number;
  }>;
};

/**
 * One of the customer's own orders, or null — which the page turns into a 404,
 * so an order number that belongs to somebody else looks exactly like one that
 * does not exist.
 */
export async function getCustomerOrder(
  customerId: string,
  email: string,
  orderNumber: string,
): Promise<AccountOrderDetail | null> {
  const order = await prisma.order.findFirst({
    where: { AND: [{ orderNumber }, await customerOrderWhere(customerId, email)] },
    include: { lines: true },
  });
  if (!order) return null;
  return {
    orderNumber: order.orderNumber,
    guestToken: order.guestToken,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    shippingMethod: order.shippingMethod,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    shipLine1: order.shipLine1,
    shipLine2: order.shipLine2,
    shipPostcode: order.shipPostcode,
    shipCity: order.shipCity,
    acsVoucherNo: order.acsVoucherNo,
    wantsInvoice: order.wantsInvoice,
    companyName: order.companyName,
    vatNumber: order.vatNumber,
    documentNo: order.erpFincode,
    subtotalGross: Number(order.subtotalGross),
    shippingGross: Number(order.shippingGross),
    paymentFeeGross: Number(order.paymentFeeGross),
    vatAmount: Number(order.vatAmount),
    totalGross: Number(order.totalGross),
    lines: order.lines.map((line) => ({
      id: line.id,
      name: line.name,
      sku: line.sku,
      quantity: line.quantity,
      lineGross: Number(line.lineGross),
      imageUrl: line.imageUrl,
      vatRate: Number(line.vatRate),
    })),
  };
}

/**
 * Adopt the guest orders placed with this address.
 *
 * Called after sign-in. Without it an order stays orphaned forever and the
 * email match above is doing all the work on every page load; stamping it once
 * means the index on `customerId` can answer instead.
 *
 * Only ever claims rows that have no customer, so it cannot move an order
 * between accounts.
 */
export async function claimGuestOrders(customerId: string, email: string): Promise<number> {
  // An unproven address claims nothing: the email is not yet known to be theirs.
  if (!(await hasProvenEmail(email))) return 0;
  const result = await prisma.order.updateMany({
    where: { customerId: null, email: { equals: email, mode: "insensitive" } },
    data: { customerId },
  });
  return result.count;
}
