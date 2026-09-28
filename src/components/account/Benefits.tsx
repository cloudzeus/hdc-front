import { getTranslations } from "next-intl/server";

/**
 * «ΝΕΟΣ ΠΕΛΑΤΗΣ»'s four bullets (account.html, screen 1) — only what an
 * account already gives, never a promise: the parcel, reorder, saved
 * addresses and invoice details, favourites and reviews.
 */
export async function Benefits() {
  const t = await getTranslations("account.Hdc");
  const rich = { b: (chunks: React.ReactNode) => <b>{chunks}</b> };
  return (
    <ul>
      <li>
        <span>{t.rich("benefit_parcel", rich)}</span>
      </li>
      <li>
        <span>{t.rich("benefit_reorder", rich)}</span>
      </li>
      <li>
        <span>{t.rich("benefit_addresses", rich)}</span>
      </li>
      <li>
        <span>{t.rich("benefit_favourites", rich)}</span>
      </li>
    </ul>
  );
}
