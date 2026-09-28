import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { HdcOrderDetail } from "@/components/account/HdcOrderDetail";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";
import { getCustomerOrder } from "@/lib/account/orders";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; orderNumber: string }>;
}): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: orderNumber, robots: { index: false, follow: false } };
}

/**
 * One order — account.html, screen 3. Only the customer's own: an order
 * number that belongs to somebody else is a 404, exactly like one that does
 * not exist (order numbers are sequential and so guessable).
 */
export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: Locale; orderNumber: string }>;
}) {
  const { locale, orderNumber } = await params;
  setRequestLocale(locale);
  const { user } = await requireCustomer(locale, `/logariasmos/paraggelies/${orderNumber}`);
  const order = await getCustomerOrder(user.id, user.email, decodeURIComponent(orderNumber));
  if (!order) notFound();

  // Full width, as screen 3: the order is the page, not a panel beside a menu.
  return (
    <AccountChrome locale={locale}>
      <main id="main" className="hdc-acc-page">
        <div className="hdc-wrap hdc-od-page">
          <HdcOrderDetail order={order} locale={locale} />
        </div>
      </main>
    </AccountChrome>
  );
}
