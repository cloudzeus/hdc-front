import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * The PACKOUT identity band (mockup `.pack`): a 520px photo, the name in the
 * biggest type on the page, one line of copy and a red button to the storage
 * range. The photo is a CSS background in home.css.
 */
export async function PackoutBand({ href }: { href: string }) {
  const t = await getTranslations("home.PackoutBand");

  return (
    <section className="hdc-pack">
      <div className="hdc-wrap">
        <h2 className="hdc-disp">
          PACKOUT™<small>{t("ypotitlos")}</small>
        </h2>
        <p>{t("keimeno")}</p>
        <div>
          <Link href={href} prefetch={false} className="hdc-btn hdc-btn-red">
            {t("cta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
