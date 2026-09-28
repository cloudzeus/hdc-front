import { getTranslations } from "next-intl/server";
import { SHOP } from "@/config/shop";
import { directionsUrl, isStoreOpen } from "@/lib/hdc-home";

const FACTS = ["paralavi", "dokimi", "symvouli", "eggyisi"] as const;

/**
 * "ΕΛΑΤΕ ΝΑ ΤΑ ΔΟΚΙΜΑΣΕΤΕ" (mockup `.store`): the physical store — four facts,
 * directions, and a picture with a black pin bar carrying the name, address,
 * hours and whether it is open right now (Athens time; the page is rendered
 * per request, so this is never a cached answer).
 *
 * Address and hours come from `SHOP.contact`, the same source as the footer.
 */
export async function StoreBand() {
  const t = await getTranslations("home.StoreBand");
  const { contact } = SHOP;
  const open = isStoreOpen(contact.hours);

  return (
    <section className="hdc-store">
      <div className="hdc-wrap hdc-store-inner">
        <div>
          <span className="hdc-slant hdc-store-tag">HEAVY DUTY CENTRE</span>
          <h2 className="hdc-disp">{t("titlos")}</h2>
          <p className="hdc-store-text">{t("keimeno")}</p>
          <ul className="hdc-store-facts">
            {FACTS.map((key) => (
              <li key={key}>
                <b>{t(`${key}_titlos`)}</b>
                <span>{t(`${key}_keimeno`)}</span>
              </li>
            ))}
          </ul>
          <a
            href={directionsUrl(contact)}
            target="_blank"
            rel="noopener noreferrer"
            className="hdc-btn hdc-btn-ink"
          >
            {t("odigies")}
          </a>
        </div>
        <div className="hdc-store-map">
          <address className="hdc-store-pin">
            <b>{SHOP.name.toUpperCase()}</b>
            <br />
            <span>
              {contact.street}, {contact.postcode} {contact.city} · {t("orario", contact.hours)} ·{" "}
              <span className={open ? "hdc-store-open" : undefined}>
                ● {open ? t("anoichta") : t("kleista")}
              </span>
            </span>
          </address>
        </div>
      </div>
    </section>
  );
}
