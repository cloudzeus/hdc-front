"use client";

import { useLocale, useTranslations } from "next-intl";
import { Fragment, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  countFor,
  formatCount,
  menuHref,
  orderGroups,
  platformName,
  rootHeroTop,
  shownCount,
  splitRoots,
  type MegaMenuData,
  type MegaRoot,
  type MenuPlatform,
  type RowFit,
} from "@/lib/catalog/mega-menu-core";
import { useFlip, useTween } from "./data";
import { PlatformSwitch } from "./PlatformSwitch";

/**
 * The mega menu on phones and tablets (below 1024px), inside the drawer
 * (mockup megamenu.html «ΣΤΟ ΚΙΝΗΤΟ»): the battery switch pinned on top as
 * four chips, the roots — split per platform as on the desktop — and, one tap
 * in, a root's own screen with a small stage and its groups.
 *
 * The drill-down is deliberate: a root's screen slides in from the right with
 * its back bar pinned to the top of the scroll (it never scrolls away), and
 * going back slides the list in from the left, with the focus on the root
 * that was opened. No screen is ever wider than the drawer.
 */

export function MobileMegaSwitch({
  plat,
  onPlat,
}: {
  plat: MenuPlatform;
  onPlat: (p: MenuPlatform) => void;
}) {
  return <PlatformSwitch variant="chips" plat={plat} onPlat={onPlat} />;
}

function Count({ n, format }: { n: number; format: (n: number) => string }) {
  return <>{format(useTween(n, 380, false))}</>;
}

export function MobileMegaScreens({
  data,
  plat,
  rootId,
  onRoot,
  onNavigate,
  allLabel,
  direction,
}: {
  data: MegaMenuData;
  plat: MenuPlatform;
  rootId: string | null;
  onRoot: (id: string | null) => void;
  onNavigate: () => void;
  /** «ΚΑΤΗΓΟΡΙΕΣ», the heading of the one list when no platform is picked. */
  allLabel: string;
  /** Which way the last move went: a root's screen in, or back to the list. */
  direction: "in" | "back";
}) {
  const t = useTranslations("chrome.MegaMenu");
  const locale = useLocale();
  const fmt = (n: number) => formatCount(n, locale);
  const label = platformName(plat, t("oles"));
  const [failed, setFailed] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const root = rootId ? data.roots.find((r) => r.id === rootId) : undefined;

  // The rows slide to their new places when the platform re-orders them.
  useFlip(listRef, `${root ? "root" : "list"}:${plat}`);

  if (!root) {
    const { fit, uni, off } = splitRoots(data.roots, plat);
    const row = (r: MegaRoot, kind: RowFit) => {
      const count = <Count n={shownCount(r.c, plat)} format={fmt} />;
      const className = `hdc-mm-pr${kind === "fit" ? "" : ` is-${kind}`}`;
      // A root without groups has no screen of its own: it is a plain link.
      return r.groups.length ? (
        <button
          key={r.id}
          type="button"
          className={className}
          data-root={r.id}
          data-flip={`r:${r.id}`}
          onClick={() => onRoot(r.id)}
        >
          <span className="n">{r.name}</span>
          <span className="c">{count}</span>
        </button>
      ) : (
        <Link
          key={r.id}
          href={menuHref(r.href, plat, r.c)}
          prefetch={false}
          className={`${className} is-link`}
          data-root={r.id}
          data-flip={`r:${r.id}`}
          onClick={onNavigate}
        >
          <span className="n">{r.name}</span>
          <span className="c">{count}</span>
        </Link>
      );
    };
    const heading = (key: string, text: string) => (
      <h6 key={key} className="hdc-mm-h6" data-flip={`h:${key}`}>
        {text}
      </h6>
    );
    return (
      <div
        className={`hdc-mm-screen${direction === "back" ? " is-back" : ""}`}
        key="list"
        ref={listRef}
      >
        {plat === "all" ? (
          <>
            {heading("fit", allLabel)}
            {fit.map((r) => row(r, "fit"))}
          </>
        ) : (
          <>
            {fit.length > 0 && heading("fit", t("gia_tin", { platform: label }))}
            {fit.map((r) => row(r, "fit"))}
            {uni.length > 0 && heading("uni", t("tairiazoun_se_ola"))}
            {uni.map((r) => row(r, "uni"))}
            {off.length > 0 && heading("off", t("alles_platformes"))}
            {off.map((r) => row(r, "off"))}
          </>
        )}
      </div>
    );
  }

  const hero = rootHeroTop(root, plat);
  const image = hero?.image ?? root.image;
  const groups = orderGroups(root.groups, plat);
  const firstUni = groups.findIndex((g) => g.fit === "uni");

  return (
    <div className="hdc-mm-screen is-inner" key={`root:${root.id}`} ref={listRef}>
      <div className="hdc-mm-backbar">
        <button type="button" className="hdc-mm-back" onClick={() => onRoot(null)} autoFocus>
          {t("oles_oi_katigories")}
        </button>
      </div>
      <div className="hdc-mm-hero" aria-hidden>
        <div className="big">
          <Count n={shownCount(root.c, plat)} format={fmt} />
        </div>
        {image && failed !== image && (
          // eslint-disable-next-line @next/next/no-img-element -- CDN WebP; the optimiser is off
          <img key={image} src={image} alt="" onError={() => setFailed(image)} />
        )}
      </div>
      <h2 className="hdc-mm-t">{root.name}</h2>
      <p className="hdc-mm-tmeta">
        {t("proionta", { n: shownCount(root.c, plat) })}
        {plat !== "all" && countFor(root.c, plat) > 0
          ? ` ${t("gia_platforma", { platform: label })}`
          : ""}
      </p>
      {groups.map(({ group, n, fit }, k) => (
        <Fragment key={group.id}>
          {plat !== "all" && k === firstUni && k > 0 && (
            <h6 className="hdc-mm-h6" data-flip="h:uni">
              {t("tairiazoun_se_ola")}
            </h6>
          )}
          <Link
            href={menuHref(group.href, plat, group.c)}
            prefetch={false}
            data-flip={`g:${group.id}`}
            className={`hdc-mm-gr${fit === "fit" ? "" : fit === "uni" ? " is-uni" : " is-dim"}`}
            onClick={onNavigate}
          >
            <span className="n">{group.name}</span>
            <span className="c">{fmt(n)}</span>
          </Link>
        </Fragment>
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
