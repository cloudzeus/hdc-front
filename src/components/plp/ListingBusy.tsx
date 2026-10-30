import { getTranslations } from "next-intl/server";
import { ListingBusyRefresh } from "@/components/plp/ListingBusyRefresh";
import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";

/**
 * What a costly listing renders when the render gate is full
 * (src/lib/server/render-gate.ts).
 *
 * Deliberately empty of data: no chrome, no menus, no products — nothing that
 * reads the database. `noindex` (a filtered view already is; a deep load-more
 * page is not, so it is said here too), retries itself after a few seconds for
 * the person who is actually waiting, and offers the unfiltered listing, which
 * never queues.
 */
export async function ListingBusy({ basePath }: { basePath: string }) {
  const t = await getTranslations("plp.ListingBusy");
  return (
    <main id="main" className="hdc-plp-page">
      <meta name="robots" content="noindex" />
      <ListingBusyRefresh />
      <div className="hdc-wrap hdc-plp-empty" role="status">
        <p className="hdc-disp">{upGreek(t("titlos"))}</p>
        <p>{t("minima")}</p>
        <Link href={basePath} prefetch={false} className="hdc-btn hdc-btn-line">
          {upGreek(t("choris_filtra"))}
        </Link>
      </div>
    </main>
  );
}
