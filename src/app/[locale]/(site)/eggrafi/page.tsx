import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { RegisterForm } from "@/components/account/AuthForms";
import { Benefits } from "@/components/account/Benefits";
import type { Locale } from "@/i18n/routing";
import { getCustomerSession } from "@/lib/account/session";

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
    title: t("meta_register"),
    description: t("meta_register_desc"),
  };
}

/**
 * Registration — a retail account (account.html, screen 1, «ΝΕΟΣ ΠΕΛΑΤΗΣ»):
 * the form beside the same graphite panel of what the account gives.
 */
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("account.Hdc");
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCustomerSession();
  if (session.state === "signed-in") redirect("/logariasmos");

  return (
    <AccountChrome locale={locale}>
      <main id="main" className="hdc-acc-page">
        <div className="hdc-wrap">
          <div className="hdc-auth hdc-auth--two">
            <section aria-labelledby="reg-title">
              <h1 id="reg-title" className="hdc-disp">
                {t("dimiourgia_logariasmou")}
              </h1>
              <p className="s">{t("register_lead")}</p>
              <RegisterForm />
            </section>
            <section className="hdc-auth-new" aria-labelledby="reg-new">
              <h2 id="reg-new" className="hdc-disp">
                {t("neos_pelatis")}
              </h2>
              <p className="s">{t("new_lead")}</p>
              <Benefits />
            </section>
          </div>
        </div>
      </main>
    </AccountChrome>
  );
}
