import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { ReviewForm } from "@/components/account/ReviewForm";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";
import { reviewableItems } from "@/lib/account/reviews";
import { getAccountShellData } from "@/lib/account/dashboard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.Hdc" });
  return { title: t("meta_reviews"), robots: { index: false, follow: false } };
}

/**
 * Τι μπορεί να αξιολογήσει ο πελάτης.
 *
 * Μόνο ό,τι έχει ΠΑΡΑΛΑΒΕΙ. Μια παραγγελία που πληρώθηκε χθες δεν έχει τίποτα να
 * πει για το εργαλείο — η αξιολόγηση αφορά τη χρήση, όχι την αγορά. Και ένα
 * κατάστημα εργαλείων ζει από την εμπιστοσύνη επαγγελματιών: μια κριτική από
 * κάποιον που δεν κράτησε ποτέ το εργαλείο τραβάει κάτω και όσες είναι αληθινές.
 *
 * Τα ΑΝΑΞΙΟΛΟΓΗΤΑ πρώτα — αυτά είναι η δουλειά που έχει η σελίδα να προτείνει.
 */
export default async function ReviewsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account.Hdc");
  const { user } = await requireCustomer(locale, "/logariasmos/axiologiseis");
  const shell = await getAccountShellData(user);

  const items = await reviewableItems(user.id, locale);
  const pending = items.filter((i) => !i.existing).length;

  return (
    <AccountChrome locale={locale}>
      <AccountShell shell={shell} active="/logariasmos/axiologiseis" title={t("nav_reviews")}>
        <section className="hdc-box">
          <h2 className="hdc-disp">{t("nav_reviews")}</h2>
          {items.length === 0 ? (
            <div className="hdc-empty">
              <p>{t("reviews_empty")}</p>
              <p>{t("reviews_empty_body")}</p>
              <Link href="/logariasmos/paraggelies" className="hdc-btn hdc-btn-red">
                {t("qa_orders")}
              </Link>
            </div>
          ) : (
            <div className="hdc-box-body">
              <p className="hdc-lead hdc-lead--box">
                {pending > 0 ? t("reviews_pending", { count: pending }) : t("reviews_lead")}
              </p>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <ReviewForm key={item.productId} item={item} />
                ))}
              </ul>
            </div>
          )}
        </section>
      </AccountShell>
    </AccountChrome>
  );
}
