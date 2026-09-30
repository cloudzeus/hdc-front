import { getTranslations } from "next-intl/server";
import { PRIMARY_PHONE, SHOP } from "@/config/shop";

/**
 * The page's H1 and the answer to «what is this»: who we are, what we sell,
 * where, and how it reaches you — in one paragraph a search result or an
 * assistant can quote whole (60–100 words). The hero slides are H2s.
 */
export async function HomeIntro() {
  const t = await getTranslations("home.HomeIntro");
  return (
    <section className="hdc-home-intro">
      <div className="hdc-wrap">
        <h1 className="hdc-disp">{t("h1")}</h1>
        <p>{t("keimeno", { street: SHOP.contact.street, city: SHOP.contact.city, phone: PRIMARY_PHONE.display })}</p>
      </div>
    </section>
  );
}
