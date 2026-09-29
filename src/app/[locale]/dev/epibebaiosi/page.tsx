import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import {
  HdcOrderConfirmation,
  type ConfirmationOrder,
} from "@/components/checkout/HdcOrderConfirmation";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * DEVELOPMENT ONLY — the order confirmation with fixture data.
 *
 * There is no real order in a fresh database, and placing one would charge a
 * card or reserve stock. This renders `HdcOrderConfirmation` with the mockup's
 * own order so the page can be checked against checkout.html, screen 3.
 * `?v=card` (paid by card, courier), `?v=bank` (awaiting a transfer, invoice),
 * `?v=pickup` (collect from the shop). A 404 in production.
 */
const FIXTURE: ConfirmationOrder = {
  orderNumber: "HDC-20260928-0001",
  status: "CONFIRMED",
  paymentStatus: "PAID",
  paymentMethod: "card",
  shippingMethod: "courier",
  supplierOrder: false,
  createdAt: new Date("2026-09-28T07:42:00Z"),
  reservedUntil: null,
  email: "email@example.gr",
  shipLine1: "Οδός Παραδείγματος 1",
  shipLine2: null,
  shipPostcode: "18545",
  shipCity: "Πειραιάς",
  wantsInvoice: false,
  companyName: null,
  vatNumber: null,
  acsVoucherNo: null,
  subtotalGross: 764.34,
  shippingGross: 0,
  paymentFeeGross: 0,
  vatAmount: 147.94,
  totalGross: 764.34,
  depositCode: null,
  payUrl: null,
  isGuest: true,
  lines: [
    {
      id: "l1",
      name: "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18FPD3-502X FUEL 4933479860",
      quantity: 1,
      lineGross: 598.92,
      imageUrl: "https://kolleris.b-cdn.net/papatheo/4933479860/primary-0-1751220334522.webp",
      vatRate: 24,
    },
    {
      id: "l2",
      name: "ΜΠΑΤΑΡΙΑ 18V 5.0AH M18 B5 4932430483",
      quantity: 1,
      lineGross: 165.42,
      imageUrl: "https://kolleris.b-cdn.net/papatheo/4932430483/primary-0-1751214102874.webp",
      vatRate: 24,
    },
  ],
};

export default async function ConfirmationPreview({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ v?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { locale } = await params;
  const { v } = await searchParams;
  setRequestLocale(locale);

  const order: ConfirmationOrder =
    v === "bank"
      ? {
          ...FIXTURE,
          paymentMethod: "bank",
          paymentStatus: "PENDING",
          reservedUntil: new Date("2026-09-28T10:42:00Z"),
          depositCode: "1234567890123456",
          wantsInvoice: true,
          companyName: "ΠΑΡΑΔΕΙΓΜΑ ΑΕ",
          vatNumber: "000000000",
        }
      : v === "pickup"
        ? { ...FIXTURE, shippingMethod: "pickup", isGuest: false }
        : FIXTURE;

  return (
    <main id="main" className="hdc-co-page">
      <HdcOrderConfirmation order={order} locale={locale} />
    </main>
  );
}
