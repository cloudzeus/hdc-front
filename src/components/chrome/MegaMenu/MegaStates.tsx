"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * What the panel shows before the menu is there: a skeleton of its own shape
 * while /api/mega-menu answers (never a blank black box, never a jump when the
 * real panel replaces it), and a way out if it does not answer at all.
 */

const bars = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => (
    <span key={`${prefix}${i}`} className="hdc-mm-sk" style={{ width: `${58 + ((i * 37) % 36)}%` }} />
  ));

/** The desktop panel's skeleton: switch, roots, groups, stage, strip. */
export function MegaSkeleton({ id }: { id: string }) {
  const t = useTranslations("chrome.MegaMenu");
  return (
    <div id={id} className="hdc-mm is-skel" role="region" aria-label={t("perioxi")} aria-busy="true">
      <div className="hdc-wrap hdc-mm-wrap">
        <div className="hdc-mm-batbar">
          <div className="hdc-mm-q">
            {t("erotisi")}
            <small>{t("erotisi_sub")}</small>
          </div>
          <div className="hdc-mm-bats" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="hdc-mm-batwrap">
                <span className="hdc-mm-bat" />
              </div>
            ))}
          </div>
          <div className="hdc-mm-tot" aria-hidden>
            <span className="hdc-mm-sk hdc-mm-sk-tot" />
          </div>
        </div>
        <div className="hdc-mm-cols" aria-hidden>
          <div className="hdc-mm-roots">
            {bars(12, "r").map((bar, i) => (
              <div key={i} className="hdc-mm-sk-row">
                {bar}
              </div>
            ))}
          </div>
          <div className="hdc-mm-groups">
            <span className="hdc-mm-sk hdc-mm-sk-h" />
            <span className="hdc-mm-sk hdc-mm-sk-meta" />
            <div className="hdc-mm-glist">
              {bars(10, "g").map((bar, i) => (
                <div key={i} className="hdc-mm-sk-row is-g">
                  {bar}
                </div>
              ))}
            </div>
          </div>
          <div className="hdc-mm-stage">
            <div className="hdc-mm-shot">
              <span className="hdc-mm-sk hdc-mm-sk-shot" />
            </div>
          </div>
        </div>
        <p className="sr-only" role="status">
          {t("fortosi")}
        </p>
      </div>
    </div>
  );
}

/** The menu did not load: say so, offer another try and the page itself. */
export function MegaFailed({
  id,
  onRetry,
  href,
  label,
  onNavigate,
}: {
  id: string;
  onRetry: () => void;
  href: string;
  label: string;
  onNavigate: () => void;
}) {
  const t = useTranslations("chrome.MegaMenu");
  return (
    <div id={id} className="hdc-mm is-failed" role="region" aria-label={t("perioxi")}>
      <div className="hdc-wrap hdc-mm-wrap">
        <div className="hdc-mm-fail" role="alert">
          <h3 className="hdc-disp">{t("apotychia")}</h3>
          <p>{t("apotychia_sub")}</p>
          <div className="hdc-mm-fail-acts">
            <button type="button" className="hdc-mm-retry" onClick={onRetry} data-autofocus>
              {t("xana")}
            </button>
            <Link href={href} prefetch={false} className="hdc-mm-allcat" onClick={onNavigate}>
              {label} →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The drawer's skeleton, pinned part: the four chips of the switch. */
export function MobileMegaSkeletonSwitch() {
  return (
    <div className="hdc-mm-pb is-skel" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="hdc-mm-sk-chip" />
      ))}
    </div>
  );
}

/** The drawer's skeleton, scrolling part: the rows of the roots. */
export function MobileMegaSkeleton() {
  const t = useTranslations("chrome.MegaMenu");
  return (
    <div className="hdc-mm-mskel" aria-busy="true">
      <div aria-hidden>
        {bars(11, "m").map((bar, i) => (
          <div key={i} className="hdc-mm-sk-row is-m">
            {bar}
          </div>
        ))}
      </div>
      <p className="sr-only" role="status">
        {t("fortosi")}
      </p>
    </div>
  );
}
