import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { SignInForm } from "@/components/account/AuthForms";
import { Benefits } from "@/components/account/Benefits";
import { ClaimAccountForm } from "@/components/account/EntryForms";
import { Link } from "@/i18n/navigation";
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
    title: t("meta_signin"),
    robots: { index: false, follow: false },
  };
}

/**
 * Sign in — account.html, screen 1: three ways in, one box. Sign in; «ΕΧΩ ΗΔΗ
 * ΠΑΡΑΓΓΕΙΛΕΙ» for a guest who wants to see an order (a link goes to the
 * email); «ΝΕΟΣ ΠΕΛΑΤΗΣ» for a retail account. No company application — an
 * invoice is asked for at checkout.
 *
 * The sign-in never says which of email or password was wrong, nor whether an
 * account exists; the action returns one message for both.
 */
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("account.Hdc");
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCustomerSession();
  if (session.state === "signed-in") redirect("/logariasmos");

  const raw = await searchParams;
  const redirectTo = typeof raw.redirect === "string" ? raw.redirect : undefined;

  return (
    <AccountChrome locale={locale}>
      <main id="main" className="hdc-acc-page">
        <div className="hdc-wrap">
          <div className="hdc-auth hdc-auth--three">
            <section aria-labelledby="auth-signin">
              <h1 id="auth-signin" className="hdc-disp">
                {t("syndesi")}
              </h1>
              <p className="s">{t("syndesi_lead")}</p>
              <SignInForm redirectTo={redirectTo} />
              {/* The phone: columns 2 and 3 become two buttons. */}
              <div className="hdc-auth-or">
                <p>{t("i")}</p>
                <Link href="/eisodos/prosvasi#paraggelia" className="hdc-btn hdc-btn-line">
                  {t("echo_idi_paraggeilei")}
                </Link>
                <Link href="/eggrafi" className="hdc-btn hdc-btn-ink">
                  {t("dimiourgia_logariasmou")}
                </Link>
              </div>
            </section>

            <section aria-labelledby="auth-guest">
              <h2 id="auth-guest" className="hdc-disp">
                {t("echo_idi_paraggeilei")}
              </h2>
              <p className="s">{t("guest_lead")}</p>
              <ClaimAccountForm />
            </section>

            <section className="hdc-auth-new" aria-labelledby="auth-new">
              <h2 id="auth-new" className="hdc-disp">
                {t("neos_pelatis")}
              </h2>
              <p className="s">{t("new_lead")}</p>
              <Benefits />
              <Link href="/eggrafi" className="hdc-btn hdc-btn-red">
                {t("dimiourgia_logariasmou")}
              </Link>
            </section>
          </div>
        </div>
      </main>
    </AccountChrome>
  );
}
