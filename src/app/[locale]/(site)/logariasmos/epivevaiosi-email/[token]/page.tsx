import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { confirmEmailProof } from "@/lib/account/email-proof";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.Hdc" });
  return { title: t("proof_title"), robots: { index: false, follow: false } };
}

/**
 * The link in the prove-your-email message. Proving the address adopts the
 * guest orders placed with it; the page says how many, or that there were none.
 */
export default async function ConfirmEmailPage({
  params,
}: {
  params: Promise<{ locale: Locale; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const [t, result] = await Promise.all([getTranslations("account.Hdc"), confirmEmailProof(token)]);

  return (
    <AccountChrome locale={locale}>
      <main id="main" className="hdc-acc-page">
        <div className="hdc-wrap">
          <div className="hdc-auth hdc-auth--one">
            <section>
              {result ? (
                <>
                  <h1 className="hdc-disp">{t("proof_ok")}</h1>
                  <p className="s">{t("proof_adopted", { count: result.adopted })}</p>
                </>
              ) : (
                <>
                  <h1 className="hdc-disp">{t("proof_bad")}</h1>
                  <p className="s">{t("proof_bad_body")}</p>
                </>
              )}
              <Link href="/logariasmos/paraggelies" className="hdc-btn hdc-btn-red">
                {t("qa_orders")}
              </Link>
            </section>
          </div>
        </div>
      </main>
    </AccountChrome>
  );
}
