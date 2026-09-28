import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { Dashboard } from "@/components/account/Dashboard";
import { HdcOrderDetail } from "@/components/account/HdcOrderDetail";
import { MyToolsBox, OrderRows } from "@/components/account/HdcAccountParts";
import type { Locale } from "@/i18n/routing";
import type { AccountDashboard, AccountShellData, OrderRowData } from "@/lib/account/dashboard";
import { myTools, type OwnedLine } from "@/lib/account/my-tools";
import type { AccountOrderDetail } from "@/lib/account/orders";
import { trackStages } from "@/lib/account/track-stages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * DEVELOPMENT ONLY — the signed-in account screens with fixture data.
 *
 * A fresh database has no orders, and placing one would charge a card or
 * reserve stock. This renders the real components with the mockup's own
 * customer so the pages can be checked against account.html: `?v=overview`
 * (screen 2), `?v=detail` (screen 3), `?v=orders`, `?v=tools`, `?v=empty`
 * (a new account). A 404 in production.
 */

const img = (code: string, file: string) => `https://kolleris.b-cdn.net/papatheo/${code}/${file}`;
const FPD3 = img("4933479860", "primary-0-1751220334522.webp");
const B5 = img("4932430483", "primary-0-1751214102874.webp");
const FSAG = img("4933478429", "primary-0-1751218639483.webp");
const HB5 = img("4932480165", "primary-0-1751219830273.webp");
const FPD3_BARE = img("4933479859", "primary-0-1751220216324.webp");

const SHELL: AccountShellData = {
  createdAt: "2026-08-14T09:00:00Z",
  orders: 3,
  addresses: 2,
  favourites: 4,
};

const ORDERS: OrderRowData[] = [
  {
    orderNumber: "HDC-20260926-0004",
    guestToken: "dev",
    status: "SHIPPED",
    paymentStatus: "PAID",
    shippingMethod: "courier",
    totalGross: 598.92,
    createdAt: new Date("2026-09-26T08:10:00Z"),
    voucherNo: "7400000000",
    thumbs: [FPD3],
    items: 1,
  },
  {
    orderNumber: "HDC-20260902-0011",
    guestToken: "dev",
    status: "DELIVERED",
    paymentStatus: "PAID",
    shippingMethod: "courier",
    totalGross: 660.53,
    createdAt: new Date("2026-09-02T08:10:00Z"),
    voucherNo: "7400000001",
    thumbs: [B5, FSAG],
    items: 3,
  },
  {
    orderNumber: "HDC-20260814-0007",
    guestToken: "dev",
    status: "DELIVERED",
    paymentStatus: "PAID",
    shippingMethod: "pickup",
    totalGross: 99.25,
    createdAt: new Date("2026-08-14T08:10:00Z"),
    voucherNo: null,
    thumbs: [HB5],
    items: 1,
  },
];

const OWNED: OwnedLine[] = [
  {
    key: "fpd3",
    name: "ΚΡΟΥΣΤΙΚΟ ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ M18 FPD3-0X FUEL 4933479859",
    platform: "M18",
    modelRoot: "M18 FPD3",
    modelContent: "bare",
    image: FPD3_BARE,
    quantity: 1,
  },
  {
    key: "fsag",
    name: "ΓΩΝΙΑΚΟΣ ΤΡΟΧΟΣ M18 FSAG125XB-0X FUEL 4933478429",
    platform: "M18",
    modelRoot: "M18 FSAG125XB",
    modelContent: "bare",
    image: FSAG,
    quantity: 1,
  },
  { key: "b5", name: "ΜΠΑΤΑΡΙΑ 18V 5.0AH M18 B5 4932430483", platform: "M18", modelRoot: null, modelContent: null, image: B5, quantity: 4 },
  { key: "hb5", name: "ΜΠΑΤΑΡΙΑ LI-ON M12 HB5 5AH 4932480165", platform: "M12", modelRoot: null, modelContent: null, image: HB5, quantity: 1 },
];

const today = new Date().toISOString().slice(0, 10);
const DASHBOARD: AccountDashboard = {
  orders: ORDERS,
  counts: { total: 3, open: 1, delivered: 2 },
  spend: { lifetime: 1358.7, year: 1358.7 },
  address: {
    id: "a1",
    label: "Κύρια διεύθυνση",
    line1: "Οδός και αριθμός",
    line2: null,
    city: "Πειραιάς",
    postcode: "18545",
  },
  addressCount: 2,
  tracking: {
    orderNumber: "HDC-20260926-0004",
    voucherNo: "7400000000",
    stages: trackStages([
      { at: "2026-09-26T09:10:00", status: "Παραλαβή από αποστολέα", place: "Πειραιάς" },
      { at: "2026-09-26T19:40:00", status: "Άφιξη στο κέντρο διαλογής", place: "Κέντρο ACS" },
      { at: `${today}T07:55:00`, status: "Σε διανομή", place: null },
    ]),
  },
  tools: myTools(OWNED),
};

const DETAIL: AccountOrderDetail = {
  orderNumber: "HDC-20260902-0011",
  guestToken: "dev",
  status: "DELIVERED",
  paymentStatus: "PAID",
  paymentMethod: "iris",
  shippingMethod: "courier",
  createdAt: new Date("2026-09-02T08:10:00Z"),
  paidAt: new Date("2026-09-02T08:12:00Z"),
  shippedAt: new Date("2026-09-02T14:00:00Z"),
  deliveredAt: new Date("2026-09-04T10:00:00Z"),
  shipLine1: "Οδός και αριθμός",
  shipLine2: null,
  shipPostcode: "18545",
  shipCity: "Πειραιάς",
  acsVoucherNo: "7400000001",
  wantsInvoice: false,
  companyName: null,
  vatNumber: null,
  documentNo: null,
  subtotalGross: 660.53,
  shippingGross: 0,
  paymentFeeGross: 0,
  vatAmount: 127.84,
  totalGross: 660.53,
  lines: [
    {
      id: "l1",
      name: "ΜΠΑΤΑΡΙΑ 18V 5.0AH M18 B5 4932430483",
      sku: "20473532039",
      quantity: 2,
      lineGross: 330.84,
      imageUrl: B5,
      vatRate: 24,
    },
    {
      id: "l2",
      name: "ΓΩΝΙΑΚΟΣ ΤΡΟΧΟΣ M18 FSAG125XB-0X FUEL 4933478429",
      sku: "21191000001",
      quantity: 1,
      lineGross: 329.69,
      imageUrl: FSAG,
      vatRate: 24,
    },
  ],
};

export default async function AccountPreview({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ v?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { locale } = await params;
  const { v = "overview" } = await searchParams;
  setRequestLocale(locale);
  const catalogueHref = "/katalogos";

  const empty: AccountDashboard = {
    orders: [],
    counts: { total: 0, open: 0, delivered: 0 },
    spend: { lifetime: 0, year: 0 },
    address: null,
    addressCount: 0,
    tracking: null,
    tools: [],
  };

  if (v === "detail") {
    return (
      <AccountChrome locale={locale}>
        <main id="main" className="hdc-acc-page">
          <div className="hdc-wrap hdc-od-page">
            <HdcOrderDetail order={DETAIL} locale={locale} />
          </div>
        </main>
      </AccountChrome>
    );
  }

  const body =
    v === "orders" ? (
      <section className="hdc-box hdc-recent">
        <h2 className="hdc-disp">ΟΙ ΠΑΡΑΓΓΕΛΙΕΣ ΜΟΥ</h2>
        <OrderRows orders={ORDERS} locale={locale} />
      </section>
    ) : v === "tools" ? (
      <MyToolsBox tools={DASHBOARD.tools} catalogueHref={catalogueHref} />
    ) : (
      <Dashboard data={v === "empty" ? empty : DASHBOARD} locale={locale} catalogueHref={catalogueHref} />
    );

  const active =
    v === "orders"
      ? "/logariasmos/paraggelies"
      : v === "tools"
        ? "/logariasmos/ta-ergaleia-mou"
        : "/logariasmos";

  return (
    <AccountChrome locale={locale}>
      <AccountShell
        shell={v === "empty" ? { ...SHELL, orders: 0, addresses: 0, favourites: 0 } : SHELL}
        active={active}
        title="ΚΑΛΩΣ ΗΡΘΑΤΕ ΞΑΝΑ"
      >
        {body}
      </AccountShell>
    </AccountChrome>
  );
}
