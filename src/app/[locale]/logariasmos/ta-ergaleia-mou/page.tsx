import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { MyToolsBox } from "@/components/account/HdcAccountParts";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { batteryCatalogueHref, getAccountShellData, getMyTools } from "@/lib/account/dashboard";
import { requireCustomer } from "@/lib/account/guard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.Hdc" });
  return { title: t("meta_tools"), robots: { index: false, follow: false } };
}

/**
 * «ΤΑ ΕΡΓΑΛΕΙΑ ΜΟΥ» on a page of its own — the overview's box, reached from
 * the side nav. See `lib/account/my-tools.ts` for what counts.
 */
export default async function MyToolsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account.Hdc");

  const { user } = await requireCustomer(locale, "/logariasmos/ta-ergaleia-mou");
  const [tools, shell, catalogueHref] = await Promise.all([
    getMyTools(user.id, user.email),
    getAccountShellData(user),
    batteryCatalogueHref(locale),
  ]);

  return (
    <AccountChrome locale={locale}>
      <AccountShell shell={shell} active="/logariasmos/ta-ergaleia-mou" title={t("nav_tools")}>
        <p className="hdc-lead">{t("tools_lead")}</p>
        {tools.length > 0 ? (
          <MyToolsBox tools={tools} catalogueHref={catalogueHref} />
        ) : (
          <section className="hdc-box">
            <h2 className="hdc-disp">{t("ta_ergaleia_mou")}</h2>
            <div className="hdc-empty">
              <p>{t("tools_empty")}</p>
              <p>{t("tools_empty_body")}</p>
              <Link href={catalogueHref} className="hdc-btn hdc-btn-red">
                {t("ergaleia_mpatarias")}
              </Link>
            </div>
          </section>
        )}
      </AccountShell>
    </AccountChrome>
  );
}
