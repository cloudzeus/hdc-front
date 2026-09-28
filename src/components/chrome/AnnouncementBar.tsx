import { useLocale, useTranslations } from "next-intl";
import { LocaleSwitch } from "@/components/chrome/LocaleSwitch";
import { FREE_SHIPPING_THRESHOLD_NET } from "@/lib/cart/options";

/**
 * The black strip above the header (mockup `.ann`): who we are on the left,
 * three buying promises in the middle, the language on the right.
 *
 * Desktop only. The phone mockups start straight at the red bar — at 390px
 * three promises would wrap into a paragraph — so on phones the language
 * switcher lives in the menu drawer instead.
 *
 * The free-shipping figure is imported, never typed: a threshold written twice
 * is a threshold that will one day disagree with the cart.
 */
export function AnnouncementBar() {
  const t = useTranslations("chrome.AnnouncementBar");
  const locale = useLocale();
  const amount =
    locale === "en" ? `€${FREE_SHIPPING_THRESHOLD_NET}` : `${FREE_SHIPPING_THRESHOLD_NET} €`;

  return (
    <div className="hdc-ann hidden lg:block">
      <div className="hdc-wrap">
        <p>{t("claim")}</p>
        <ul className="hdc-ann-mid" aria-label={t("promises")}>
          <li>{t("free_shipping", { amount })}</li>
          <li>{t("store_pickup")}</li>
          <li>{t("card_payment")}</li>
        </ul>
        <LocaleSwitch />
      </div>
    </div>
  );
}
