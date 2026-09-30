import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { ProfileForm } from "@/components/account/AuthForms";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";
import { getAccountShellData } from "@/lib/account/dashboard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "account.Hdc" });
  return {
    title: t("meta_details"),
    robots: { index: false, follow: false },
  };
}

/** Personal details. Identical for both account types — a person is a person. */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account.Hdc");

  const { user } = await requireCustomer(locale, "/logariasmos/stoicheia");
  const shell = await getAccountShellData(user);

  return (
    <AccountChrome locale={locale}>
      <AccountShell shell={shell} active="/logariasmos/stoicheia" title={t("nav_details")}>
        <section className="hdc-box">
          <h2 className="hdc-disp">{t("prosopika_stoicheia")}</h2>
          <div className="hdc-box-body">
            <ProfileForm user={user} />
          </div>
        </section>
        <p className="hdc-lead">{t("details_invoice_note")}</p>
      </AccountShell>
    </AccountChrome>
  );
}
