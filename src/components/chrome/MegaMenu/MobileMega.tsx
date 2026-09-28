"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  MENU_PLATFORMS,
  countFor,
  formatCount,
  isUniversal,
  menuHref,
  orderGroups,
  platformName,
  rootHeroTop,
  shownCount,
  splitRoots,
  type MegaMenuData,
  type MegaRoot,
  type MenuPlatform,
} from "@/lib/catalog/mega-menu-core";

/**
 * The mega menu on phones and tablets, inside the drawer (mockup megamenu.html
 * «ΣΤΟ ΚΙΝΗΤΟ»): the battery switch pinned on top as four chips, the roots —
 * split per platform as on the desktop — and, one tap in, a root's own screen
 * with a small stage and its groups. Screens slide in one inside the other.
 */

export function MobileMegaSwitch({
  plat,
  onPlat,
}: {
  plat: MenuPlatform;
  onPlat: (p: MenuPlatform) => void;
}) {
  const t = useTranslations("chrome.MegaMenu");
  return (
    <div className="hdc-mm-pb" role="group" aria-label={t("diakoptis")}>
      {MENU_PLATFORMS.map((p) => (
        <button
          key={p}
          type="button"
          className={p === plat ? "is-on" : undefined}
          aria-pressed={p === plat}
          onClick={() => onPlat(p)}
        >
          {platformName(p, t("oles"))}
        </button>
      ))}
    </div>
  );
}

export function MobileMegaScreens({
  data,
  plat,
  rootId,
  onRoot,
  onNavigate,
  allLabel,
}: {
  data: MegaMenuData;
  plat: MenuPlatform;
  rootId: string | null;
  onRoot: (id: string | null) => void;
  onNavigate: () => void;
  /** «ΚΑΤΗΓΟΡΙΕΣ», the heading of the one list when no platform is picked. */
  allLabel: string;
}) {
  const t = useTranslations("chrome.MegaMenu");
  const locale = useLocale();
  const fmt = (n: number) => formatCount(n, locale);
  const label = platformName(plat, t("oles"));
  const [failed, setFailed] = useState<string | null>(null);

  const root = rootId ? data.roots.find((r) => r.id === rootId) : undefined;

  if (!root) {
    const { fit, uni } = splitRoots(data.roots, plat);
    const row = (r: MegaRoot, uniRow: boolean) => {
      const count = fmt(uniRow ? r.c.all : countFor(r.c, plat));
      const className = `hdc-mm-pr${uniRow ? " is-uni" : ""}`;
      // A root without groups has no screen of its own: it is a plain link.
      return r.groups.length ? (
        <button key={r.id} type="button" className={className} onClick={() => onRoot(r.id)}>
          <span className="n">{r.name}</span>
          <span className="c">{count}</span>
        </button>
      ) : (
        <Link
          key={r.id}
          href={menuHref(r.href, plat, r.c)}
          prefetch={false}
          className={className}
          onClick={onNavigate}
        >
          <span className="n">{r.name}</span>
          <span className="c">{count}</span>
        </Link>
      );
    };
    return (
      <div className="hdc-mm-screen" key={`list:${plat}`}>
        {plat === "all" ? (
          <>
            <h6 className="hdc-mm-h6">{allLabel}</h6>
            {fit.map((r) => row(r, false))}
          </>
        ) : (
          <>
            <h6 className="hdc-mm-h6">{t("gia_tin", { platform: label })}</h6>
            {fit.map((r) => row(r, false))}
            {uni.length > 0 && <h6 className="hdc-mm-h6">{t("tairiazoun_se_ola")}</h6>}
            {uni.map((r) => row(r, true))}
          </>
        )}
      </div>
    );
  }

  const universal = isUniversal(root.c, plat);
  const hero = rootHeroTop(root, plat);
  const image = hero?.image ?? root.image;

  return (
    <div className="hdc-mm-screen is-inner" key={`root:${root.id}`}>
      <button type="button" className="hdc-mm-back" onClick={() => onRoot(null)} autoFocus>
        {t("oles_oi_katigories")}
      </button>
      <div className="hdc-mm-hero" aria-hidden>
        <div className="big">{fmt(shownCount(root.c, plat))}</div>
        {image && failed !== image && (
          // eslint-disable-next-line @next/next/no-img-element -- CDN WebP; the optimiser is off
          <img src={image} alt="" onError={() => setFailed(image)} />
        )}
      </div>
      <h2 className="hdc-mm-t">{root.name}</h2>
      {orderGroups(root.groups, plat, universal).map(({ group, n }) => (
        <Link
          key={group.id}
          href={menuHref(group.href, plat, group.c)}
          prefetch={false}
          className={`hdc-mm-gr${n ? "" : " is-dim"}`}
          onClick={onNavigate}
        >
          <span className="n">{group.name}</span>
          <span className="c">{fmt(n)}</span>
        </Link>
      ))}
      <Link
        href={menuHref(root.href, plat, root.c)}
        prefetch={false}
        className="hdc-mm-mall"
        onClick={onNavigate}
      >
        {t("oli_i_katigoria")} →
      </Link>
    </div>
  );
}
