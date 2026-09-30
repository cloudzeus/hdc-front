import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { HUBS } from "@/lib/seo/hubs";

/**
 * "ΔΙΑΛΕΞΤΕ ΠΛΑΤΦΟΡΜΑ" (mockup `.plat`): the red band with the three battery
 * platforms — how a Milwaukee customer thinks ("I have M18 batteries").
 *
 * Each tile opens the platform's hub (/milwaukee-m12, /milwaukee-m18,
 * /mx-fuel): categories, models, batteries and the platform explained — the
 * pages the platform searches should land on, linked from the home page.
 */
const PLATFORMS = [
  { key: "m12", mark: "M", rest: "12", href: HUBS.m12.path, label: "M12" },
  { key: "m18", mark: "M", rest: "18", href: HUBS.m18.path, label: "M18" },
  { key: "mx", mark: "MX", rest: "FUEL", href: HUBS["mx-fuel"].path, label: "MX FUEL" },
] as const;

export async function PlatformBand() {
  const t = await getTranslations("home.PlatformBand");

  return (
    <section className="hdc-plat">
      <div className="hdc-wrap">
        <h2 className="hdc-disp">{t("titlos")}</h2>
        <p className="hdc-plat-sub">{t("ypotitlos")}</p>
        <div className="hdc-plat-grid">
          {PLATFORMS.map((p) => (
            <Link
              key={p.key}
              href={p.href}
              prefetch={false}
              className="hdc-plat-tile"
            >
              <div className="hdc-plat-badge" aria-label={p.label}>
                <i>{p.mark}</i>
                {p.rest}
              </div>
              <div className="hdc-plat-tag">{t(`${p.key}_tag`)}</div>
              <p className="hdc-plat-d">{t(`${p.key}_keimeno`)}</p>
              <div className="hdc-plat-go">{t(`${p.key}_go`)} →</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
