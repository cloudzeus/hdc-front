import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AcceptInviteForm } from "@/components/account/EntryForms";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { resolveInvite } from "@/lib/account/registration-invite";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.Hdc" });
  return { title: t("oloklirosi_eggrafis"), robots: { index: false, follow: false } };
}

/**
 * The link from «ΕΧΩ ΗΔΗ ΠΑΡΑΓΓΕΙΛΕΙ»: choose a password and the account
 * opens with every order placed with that email already in it.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ locale: Locale; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const [t, invite] = await Promise.all([getTranslations("account.Hdc"), resolveInvite(token)]);
  const name = invite ? `${invite.firstName} ${invite.lastName}`.trim() : "";

  return (
    <AccountChrome locale={locale}>
      <main id="main" className="hdc-acc-page">
        <div className="hdc-wrap">
          <div className="hdc-auth hdc-auth--one">
            <section>
              <h1 className="hdc-disp">{t("oloklirosi_eggrafis")}</h1>
              {invite ? (
                <>
                  <p className="s">{t("invite_lead")}</p>
                  <AcceptInviteForm token={token} email={invite.email} name={name} />
                </>
              ) : (
                <>
                  <p className="s">{t("invite_expired")}</p>
                  <Link href="/eisodos/prosvasi#paraggelia" className="hdc-btn hdc-btn-red">
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
