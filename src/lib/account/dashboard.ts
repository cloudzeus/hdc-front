import "server-only";
import { prisma } from "@/lib/prisma";
import { trackVoucher } from "@/lib/courier/acs";
import { hasProvenEmail } from "@/lib/account/email-proof";
import type { AccountUser } from "@/lib/account/contract";
import { myTools, type OwnedLine, type PlatformTools } from "@/lib/account/my-tools";
import { OPEN_STATUSES, OWNED_STATUSES } from "@/lib/account/order-view";
import { trackStages, type TrackStage } from "@/lib/account/track-stages";
import { getRootCategories } from "@/lib/catalog/queries";
import { isBattery } from "@/lib/hdc-nav";
import type { Locale } from "@/i18n/routing";

/**
 * What the account overview loads (account.html, screen 2), in the order the
 * customer comes for it: where is my parcel, what did I buy, change something.
 *
 * Orders are matched on customerId OR — once the address is proven, see
 * `hasProvenEmail` — the account's email: people order as a guest first and
 * register afterwards, and an account that shows five of their seven orders
 * looks like the shop lost two.
 */

/** One row of «ΠΡΟΣΦΑΤΕΣ ΠΑΡΑΓΓΕΛΙΕΣ» / the orders page. */
export type OrderRowData = {
  orderNumber: string;
  guestToken: string;
  status: string;
  paymentStatus: string;
  shippingMethod: string;
  totalGross: number;
  createdAt: Date;
  voucherNo: string | null;
  /** Product pictures, up to three — what somebody recognises an order by. */
  thumbs: string[];
  /** Units in the order. */
  items: number;
};

export type AccountDashboard = {
  orders: OrderRowData[];
  counts: { total: number; open: number; delivered: number };
  spend: { lifetime: number; year: number };
  address: {
    id: string;
    label: string;
    line1: string;
    line2: string | null;
    city: string;
    postcode: string;
  } | null;
  addressCount: number;
  /** The parcel worth watching: the newest shipped, undelivered courier order. */
  tracking: { orderNumber: string; voucherNo: string; stages: TrackStage[] } | null;
  tools: PlatformTools[];
};

/** Figures the account shell prints in its black bar and side nav. */
export type AccountShellData = {
  createdAt: string;
  orders: number;
  addresses: number;
  favourites: number;
};

/** The `where` for "this customer's orders". */
export async function customerOrderWhere(customerId: string, email: string) {
  return (await hasProvenEmail(email))
    ? { OR: [{ customerId }, { email: { equals: email, mode: "insensitive" as const } }] }
    : { customerId };
}

export const ORDER_ROW_SELECT = {
  orderNumber: true,
  guestToken: true,
  status: true,
  paymentStatus: true,
  shippingMethod: true,
  totalGross: true,
  createdAt: true,
  acsVoucherNo: true,
  lines: { select: { imageUrl: true, quantity: true } },
} as const;

type OrderRowRow = {
  orderNumber: string;
  guestToken: string;
  status: string;
  paymentStatus: string;
  shippingMethod: string;
  totalGross: unknown;
  createdAt: Date;
  acsVoucherNo: string | null;
  lines: Array<{ imageUrl: string | null; quantity: number }>;
};

export function toOrderRow(o: OrderRowRow): OrderRowData {
  return {
    orderNumber: o.orderNumber,
    guestToken: o.guestToken,
    status: o.status,
    paymentStatus: o.paymentStatus,
    shippingMethod: o.shippingMethod,
    totalGross: Number(o.totalGross),
    createdAt: o.createdAt,
    voucherNo: o.acsVoucherNo,
    thumbs: o.lines
      .map((l) => l.imageUrl)
      .filter((u): u is string => Boolean(u))
      .slice(0, 3),
    items: o.lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}

export async function getAccountShellData(user: AccountUser): Promise<AccountShellData> {
  const where = await customerOrderWhere(user.id, user.email);
  const [orders, addresses, favourites] = await Promise.all([
    prisma.order.count({ where }),
    prisma.customerAddress.count({ where: { customerId: user.id } }),
    prisma.favourite.count({ where: { customerId: user.id, product: { isActive: true } } }),
  ]);
  return { createdAt: user.createdAt, orders, addresses, favourites };
}

/**
 * «ΤΑ ΕΡΓΑΛΕΙΑ ΜΟΥ»: the lines of the orders the customer received or paid
 * for, joined to the catalogue for platform, model root, picture and — for
 * kits — the manufacturer's block that says how many batteries are in the box.
 */
export async function getMyTools(customerId: string, email: string): Promise<PlatformTools[]> {
  const where = await customerOrderWhere(customerId, email);
  const lines = await prisma.orderLine.findMany({
    where: { order: { ...where, status: { in: [...OWNED_STATUSES] } } },
    select: { mtrl: true, sku: true, name: true, imageUrl: true, quantity: true },
  });
  const mtrls = [...new Set(lines.map((l) => l.mtrl).filter((m): m is number => m != null))];
  if (mtrls.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { mtrl: { in: mtrls } },
    select: {
      id: true,
      mtrl: true,
      name: true,
      platform: true,
      modelRoot: true,
      modelContent: true,
      images: { where: { isFeature: true }, take: 1, select: { url: true } },
      translations: { where: { locale: "el" }, select: { longDescription: true } },
    },
  });
  const byMtrl = new Map(products.map((p) => [p.mtrl, p]));

  const owned: OwnedLine[] = lines.flatMap((line) => {
    const p = line.mtrl != null ? byMtrl.get(line.mtrl) : undefined;
    if (!p) return [];
    return [
      {
        key: p.id,
        name: p.name,
        platform: p.platform,
        modelRoot: p.modelRoot,
        modelContent: p.modelContent,
        image: p.images[0]?.url ?? line.imageUrl,
        quantity: line.quantity,
        description: p.modelContent === "kit" ? (p.translations[0]?.longDescription ?? null) : null,
      },
    ];
  });
  return myTools(owned);
}

export async function getAccountDashboard(
  customerId: string,
  email: string,
): Promise<AccountDashboard> {
  const where = await customerOrderWhere(customerId, email);
  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const [rows, total, open, delivered, lifetimeAgg, yearAgg, address, addressCount, transit, tools] =
    await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 3,
        select: ORDER_ROW_SELECT,
      }),
      prisma.order.count({ where }),
      prisma.order.count({ where: { ...where, status: { in: [...OPEN_STATUSES] } } }),
      prisma.order.count({ where: { ...where, status: "DELIVERED" } }),
      // Paid only: an abandoned card attempt is not money the customer spent.
      prisma.order.aggregate({ where: { ...where, paymentStatus: "PAID" }, _sum: { totalGross: true } }),
      prisma.order.aggregate({
        where: { ...where, paymentStatus: "PAID", createdAt: { gte: yearStart } },
        _sum: { totalGross: true },
      }),
      prisma.customerAddress.findFirst({
        where: { customerId },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        select: { id: true, label: true, line1: true, line2: true, city: true, postcode: true },
      }),
      prisma.customerAddress.count({ where: { customerId } }),
      // Shipped and not yet delivered, by courier: the one parcel on its way.
      prisma.order.findFirst({
        where: { ...where, status: "SHIPPED", acsVoucherNo: { not: null }, shippingMethod: { not: "pickup" } },
        orderBy: { createdAt: "desc" },
        select: { orderNumber: true, acsVoucherNo: true },
      }),
      getMyTools(customerId, email),
    ]);

  /*
   * One parcel is tracked, not all of them: each lookup is a call to ACS
   * through HDCtool, and a courier API is slow often enough that several would
   * make this page feel broken. When ACS does not answer, the strip still
   * shows — the parcel is on its way whatever the courier's API says — at the
   * first stage.
   */
  let tracking: AccountDashboard["tracking"] = null;
  if (transit?.acsVoucherNo) {
    const result = await trackVoucher(transit.acsVoucherNo).catch(() => null);
    const checkpoints =
      result?.ok
        ? (result.data.checkpoints ?? []).map((c) => ({
            at: c.date ?? "",
            status: c.action ?? c.notes ?? "",
            place: c.location ?? null,
          }))
        : [];
    tracking = {
      orderNumber: transit.orderNumber,
      voucherNo: transit.acsVoucherNo,
      stages: trackStages(checkpoints),
    };
  }

  return {
    orders: rows.map(toOrderRow),
    counts: { total, open, delivered },
    spend: {
      lifetime: Number(lifetimeAgg._sum.totalGross ?? 0),
      year: Number(yearAgg._sum.totalGross ?? 0),
    },
    address,
    addressCount,
    tracking,
    tools,
  };
}

/** Where «δείτε τα σκέτα εργαλεία» points: the battery-tools category, or the catalogue. */
export async function batteryCatalogueHref(locale: Locale): Promise<string> {
  const roots = await getRootCategories(locale);
  const battery = roots.find((c) => isBattery({ slug: c.slug, name: c.name }));
  return battery ? `/katalogos/${battery.slug}` : "/katalogos";
}
