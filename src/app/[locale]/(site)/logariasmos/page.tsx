import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { Dashboard } from "@/components/account/Dashboard";
import { EmailProofPanel } from "@/components/account/EmailProofPanel";
import {
  batteryCatalogueHref,
  getAccountDashboard,
  getAccountShellData,
} from "@/lib/account/dashboard";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";
import { hasProvenEmail } from "@/lib/account/email-proof";

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
    title: t("meta_account"),
    robots: { index: false, follow: false },
  };
}

/** Account overview — account.html, screen 2. */
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account.Hdc");

  const { user } = await requireCustomer(locale, "/logariasmos");
  const [dashboard, shell, proven, catalogueHref, tp] = await Promise.all([
    getAccountDashboard(user.id, user.email),
    getAccountShellData(user),
    hasProvenEmail(user.email),
    batteryCatalogueHref(locale),
    getTranslations("paraggelies.page"),
  ]);

  return (
    <AccountChrome locale={locale}>
      <AccountShell shell={shell} active="/logariasmos" title={t("kalos_irthate_xana")}>
        <Dashboard
          data={dashboard}
          locale={locale}
          catalogueHref={catalogueHref}
          before={
            !proven && (
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
            )
          }
        />
      </AccountShell>
    </AccountChrome>
  );
}
