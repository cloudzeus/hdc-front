import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { AddressBook } from "@/components/account/AddressBook";
import type { Locale } from "@/i18n/routing";
import { getAccountShellData } from "@/lib/account/dashboard";
import { requireCustomer } from "@/lib/account/guard";
import { prisma } from "@/lib/prisma";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.Hdc" });
  return { title: t("meta_addresses"), robots: { index: false, follow: false } };
}

/**
 * Saved delivery addresses.
 *
 * For every customer, not only companies. Somebody ordering for two sites, or
 * having tools sent to a job rather than home, retypes the same address every
 * time otherwise.
 *
 * The saved address is a template, never a link. An order records the address it
 * was actually sent to, so editing one here does not rewrite where last month's
 * parcel went.
 */
export default async function AddressesPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account.Hdc");

  const { user } = await requireCustomer(locale, "/logariasmos/dieuthynseis");
  const shell = await getAccountShellData(user);

  const addresses = await prisma.customerAddress.findMany({
    where: { customerId: user.id },
    // Default first, then most recently touched: the two an address book is
    // normally opened to find.
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      label: true,
      firstName: true,
      lastName: true,
      phone: true,
      line1: true,
      line2: true,
      city: true,
      postcode: true,
      region: true,
      adminRegion: true,
      isDefault: true,
    },
  });

  return (
    <AccountChrome locale={locale}>
      <AccountShell shell={shell} active="/logariasmos/dieuthynseis" title={t("nav_addresses")}>
        <section className="hdc-box">
          <h2 className="hdc-disp">{t("oi_dieuthynseis_mou")}</h2>
          <div className="hdc-box-body">
            <p className="hdc-lead hdc-lead--box">{t("addresses_lead")}</p>
            <AddressBook addresses={addresses} />
          </div>
        </section>
      </AccountShell>
    </AccountChrome>
  );
}
