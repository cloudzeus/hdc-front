import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { NewPasswordForm } from "@/components/account/EntryForms";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { resolveResetToken } from "@/lib/account/password-reset";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.Hdc" });
  return { title: t("neos_kodikos"), robots: { index: false, follow: false } };
}

/** A new password from a reset link — one column of the sign-in box. */
export default async function NewPasswordPage({
  params,
}: {
  params: Promise<{ locale: Locale; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const [t, resolved] = await Promise.all([getTranslations("account.Hdc"), resolveResetToken(token)]);

  return (
    <AccountChrome locale={locale}>
      <main id="main" className="hdc-acc-page">
        <div className="hdc-wrap">
          <div className="hdc-auth hdc-auth--one">
            <section>
              <h1 className="hdc-disp">{t("neos_kodikos")}</h1>
              {resolved ? (
                <>
                  <p className="s">{t("neos_kodikos_lead", { email: resolved.email })}</p>
                  <NewPasswordForm token={token} />
                </>
              ) : (
                <>
                  <p className="s">{t("link_expired")}</p>
                  <Link href="/eisodos/prosvasi" className="hdc-btn hdc-btn-red">
                    {t("neos_syndesmos")}
                  </Link>
                </>
              )}
            </section>
          </div>
        </div>
      </main>
    </AccountChrome>
  );
}
