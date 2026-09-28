import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * "ΔΙΑΛΕΞΤΕ ΠΛΑΤΦΟΡΜΑ" (mockup `.plat`): the red band with the three battery
 * platforms — how a Milwaukee customer thinks ("I have M18 batteries").
 *
 * There is no platform filter in the catalogue yet (it arrives with the new
 * catalogue, Plan 3 Task 3), so each tile opens a search for the platform's
 * name, the same as the footer's platform links.
 */
const PLATFORMS = [
  { key: "m12", mark: "M", rest: "12", q: "M12", label: "M12" },
  { key: "m18", mark: "M", rest: "18", q: "M18", label: "M18" },
  /* The ERP writes the platform as "MXF": a search for "MX FUEL" finds nothing. */
  { key: "mx", mark: "MX", rest: "FUEL", q: "MXF", label: "MX FUEL" },
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
              href={`/anazitisi?q=${encodeURIComponent(p.q)}`}
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
