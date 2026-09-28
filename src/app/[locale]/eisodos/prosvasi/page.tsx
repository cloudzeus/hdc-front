import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { ClaimAccountForm, ForgotPasswordForm } from "@/components/account/EntryForms";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.Hdc" });
  return { title: t("prosvasi_title"), robots: { index: false, follow: false } };
}

/**
 * Both ways back in, in the sign-in page's box: a forgotten password, and
 * «ΕΧΩ ΗΔΗ ΠΑΡΑΓΓΕΙΛΕΙ» for a guest (the phone's sign-in links here, to
 * `#paraggelia`). Either way a link goes to the email.
 */
export default async function AccessPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account.Hdc");

  return (
    <AccountChrome locale={locale}>
      <main id="main" className="hdc-acc-page">
        <div className="hdc-wrap">
          <div className="hdc-auth hdc-auth--pair">
            <section aria-labelledby="acc-forgot">
              <h1 id="acc-forgot" className="hdc-disp">
                {t("xechasa_ton_kodiko")}
              </h1>
              <p className="s">{t("forgot_lead")}</p>
              <ForgotPasswordForm />
              <p className="alt">
                <Link href="/eisodos">{t("piso_sti_syndesi")}</Link>
              </p>
            </section>
            <section id="paraggelia" aria-labelledby="acc-guest">
              <h2 id="acc-guest" className="hdc-disp">
                {t("echo_idi_paraggeilei")}
              </h2>
              <p className="s">{t("guest_lead")}</p>
              <ClaimAccountForm button="red" />
            </section>
          </div>
        </div>
      </main>
    </AccountChrome>
  );
}
