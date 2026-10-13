import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { ReorderButton } from "@/components/account/ReorderButton";
import { HdcOrderConfirmation } from "@/components/checkout/HdcOrderConfirmation";
import type { Locale } from "@/i18n/routing";
import { getViewer } from "@/lib/account/session";
import { getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { paymentPageUrl } from "@/lib/payment/viva";
import { isValidGtin } from "@/lib/feeds/google-merchant";
import { GoogleReviewsOptIn } from "@/components/seo/GoogleReviewsOptIn";
import { estimatedDeliveryDate, orderedProductsWhere } from "@/lib/seo/google-reviews";
import { prisma } from "@/lib/prisma";
import { requestPath } from "@/lib/requests/model";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "epibebaiosi.Hdc" });
  return {
    title: t("meta_title"),
    robots: { index: false, follow: false },
  };
}

type PageProps = {
  params: Promise<{ locale: Locale; orderNumber: string }>;
  searchParams: Promise<{ t?: string; s?: string }>;
};

/**
 * Order confirmation — checkout.html, screen 3. The layout is
 * `HdcOrderConfirmation`; this route reads the order, checks its token and
 * maps the row onto it.
 */
export default async function ConfirmationPage({ params, searchParams }: PageProps) {
  const { locale, orderNumber } = await params;
  // Named on destructuring: the URL contract stays `?t=…`, but `t` alone is
  // both meaningless for a security token and the name every translator uses.
  const { t: guestToken } = await searchParams;
  setRequestLocale(locale);

  const [order, miniCart, menuTree, brands, stats, rootCategories, viewer] = await Promise.all([
    prisma.order.findUnique({ where: { orderNumber }, include: { lines: true } }),
    getMiniCart(locale),
    getMenuTree(locale),
    getTopBrands(locale),
    getCatalogueStats(),
    getRootCategories(locale),
    getViewer(),
  ]);

  /*
   * The guest token is what makes this page private. Without it an order number
   * — which is sequential and therefore guessable — would expose a stranger's
   * name, address and phone.
   */
  if (!order || !guestToken || guestToken !== order.guestToken) notFound();

  /*
   * A back-order request that is not yet an accepted, payable order has its
   * own page (offer, accept, decline). Viva's return lands here after an
   * ACCEPTED request is paid, and that one is an ordinary order from then on.
   */
  if (order.requestStatus && order.requestStatus !== "ACCEPTED" && order.requestToken) {
    redirect(requestPath(locale, order.requestToken));
  }

  /* The other half of a split cart: the lines that went as a request. */
  const childRequest = await prisma.order.findFirst({
    where: { parentOrderNumber: order.orderNumber, requestStatus: { not: null } },
    select: { orderNumber: true, requestToken: true },
  });

  const quote = order.shippingQuote as { etaDays?: string } | null;
  const awaitingPayment = order.paymentStatus === "PENDING";

  /*
   * The payment code for a bank transfer, shown only while the money is still
   * outstanding. Absent when Viva could not be reached at checkout, which is
   * not an error here: the order stands, and the fallback is the order number.
   * The link is the same one Viva emails — repeated because an email is a
   * thing people close, filter or never receive.
   */
  const depositCode =
    order.paymentMethod === "bank" && awaitingPayment ? order.vivaOrderCode : null;

  /*
   * GTINs for the Google Customer Reviews opt-in. Looked up rather than read
   * off the order (a snapshot that never carried them); only codes that survive
   * their own check digit are sent.
   */
  const ordered = orderedProductsWhere(order.lines);
  const gtins = ordered
    ? (
        await prisma.product.findMany({
          where: ordered,
          select: { code1: true },
        })
      )
        .map((p) => p.code1)
        .filter(isValidGtin)
        .map((code) => code.replace(/\D/g, ""))
    : [];

  return (
    <>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />

      {/*
        Google's survey opt-in, around the time the order should arrive. Not
        shown while payment is outstanding: an order that may never be paid is
        not one to schedule a delivery survey for.
      */}
      {!awaitingPayment && (
        <GoogleReviewsOptIn
          orderId={order.orderNumber}
          email={order.email}
          deliveryCountry={order.shipCountry}
          estimatedDeliveryDate={estimatedDeliveryDate(
            order.createdAt,
            // A supplier order leaves in 3–5 working days, whatever the zone —
            // and is not ready in two hours at the shop either.
            order.supplierOrder ? "3-5" : quote?.etaDays,
            order.supplierOrder ? "courier" : order.shippingMethod,
          )}
          gtins={gtins}
        />
      )}

      <main id="main" className="hdc-co-page">
        <HdcOrderConfirmation
          locale={locale}
          childRequest={
            childRequest?.requestToken
              ? { orderNumber: childRequest.orderNumber, href: requestPath(locale, childRequest.requestToken) }
              : null
          }
          order={{
            orderNumber: order.orderNumber,
            status: order.status,
            paymentStatus: order.paymentStatus,
            paymentMethod: order.paymentMethod,
            shippingMethod: order.shippingMethod,
            supplierOrder: order.supplierOrder,
            createdAt: order.createdAt,
            reservedUntil: order.reservedUntil,
            email: order.email,
            shipLine1: order.shipLine1,
            shipLine2: order.shipLine2,
            shipPostcode: order.shipPostcode,
            shipCity: order.shipCity,
            shipCountry: order.shipCountry,
            wantsInvoice: order.wantsInvoice,
            companyName: order.companyName,
            vatNumber: order.vatNumber,
            acsVoucherNo: order.acsVoucherNo,
            subtotalGross: Number(order.subtotalGross),
            shippingGross: Number(order.shippingGross),
            paymentFeeGross: Number(order.paymentFeeGross),
            vatAmount: Number(order.vatAmount),
            totalGross: Number(order.totalGross),
            depositCode,
            payUrl: depositCode ? paymentPageUrl(depositCode) : null,
            isGuest: order.customerId == null && viewer.user == null,
            lines: order.lines.map((line) => ({
              id: line.id,
              name: line.name,
              quantity: line.quantity,
              lineGross: Number(line.lineGross),
              imageUrl: line.imageUrl,
              vatRate: Number(line.vatRate),
            })),
          }}
          /*
            Reorder from the order itself — the only order view a customer who
            never registered can reach, the `?t=` token being what authorises it.
          */
          extra={
            <div className="hdc-ok-reorder">
              <ReorderButton
                orderNumber={order.orderNumber}
                token={order.guestToken}
                locale={locale}
                variant="line"
              />
            </div>
          }
        />
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
