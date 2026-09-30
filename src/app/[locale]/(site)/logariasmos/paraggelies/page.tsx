import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { EmailProofPanel } from "@/components/account/EmailProofPanel";
import { OrderRows } from "@/components/account/HdcAccountParts";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";
import { getAccountShellData } from "@/lib/account/dashboard";
import { claimGuestOrders, listCustomerOrders } from "@/lib/account/orders";
import { hasProvenEmail } from "@/lib/account/email-proof";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.Hdc" });
  return { title: t("meta_orders"), robots: { index: false, follow: false } };
}

/**
 * My orders — the rows of account.html, screen 2, for every order.
 *
 * Orders placed as a guest before registering are matched on the email and
 * adopted, but only once the account has proven that address
 * (`hasProvenEmail`); until then the page explains how.
 */
export default async function OrdersPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tp] = await Promise.all([getTranslations("account.Hdc"), getTranslations("paraggelies.page")]);

  const { user } = await requireCustomer(locale, "/logariasmos/paraggelies");

  // Stamp the guest orders onto the account, so the index on `customerId` can
  // answer next time instead of a case-insensitive scan on email.
  await claimGuestOrders(user.id, user.email);
  const [orders, proven, shell] = await Promise.all([
    listCustomerOrders(user.id, user.email),
    hasProvenEmail(user.email),
    getAccountShellData(user),
  ]);

  return (
    <AccountChrome locale={locale}>
      <AccountShell shell={shell} active="/logariasmos/paraggelies" title={t("nav_orders")}>
        {!proven && (
          <EmailProofPanel
            text={{
              title: tp("epivevaiosi_titlos"),
              body: tp("epivevaiosi_body", { email: user.email }),
              steps: [tp("epivevaiosi_vima_1"), tp("epivevaiosi_vima_2"), tp("epivevaiosi_vima_3")],
              button: tp("epivevaiosi_koumpi"),
              sending: tp("epivevaiosi_apostoli"),
              sent: tp("epivevaiosi_stalthike", { email: user.email }),
              sentHint: tp("epivevaiosi_den_irthe"),
            }}
          />
        )}
        <section className="hdc-box hdc-recent">
          <h2 className="hdc-disp">{t("oi_paraggelies_mou")}</h2>
          {orders.length === 0 ? (
            <div className="hdc-empty">
              <p>{t("kamia_paraggelia")}</p>
              <p>{t("kamia_paraggelia_body")}</p>
              <Link href="/katalogos" className="hdc-btn hdc-btn-red">
                {t("ston_katalogo")}
              </Link>
            </div>
          ) : (
            <OrderRows orders={orders} locale={locale} />
          )}
        </section>
      </AccountShell>
    </AccountChrome>
  );
}
