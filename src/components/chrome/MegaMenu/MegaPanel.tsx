"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  MENU_PLATFORMS,
  batteryFills,
  countFor,
  formatCount,
  isUniversal,
  menuHref,
  orderGroups,
  platformName,
  shownCount,
  splitRoots,
  topFor,
  withParam,
  type MegaGroup,
  type MegaMenuData,
  type MegaRoot,
  type MenuPlatform,
} from "@/lib/catalog/mega-menu-core";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/routing";
import { useTween } from "./data";

/**
 * The desktop mega menu panel (mockup megamenu.html `.mega`): the battery
 * switch, the roots, the groups of the selected root, the «stage», and the
 * strip of shortcuts. Everything re-counts for the platform the switch holds.
 *
 * State that outlives a hover (which root, which platform) belongs to the
 * header (`HeaderMega`); the stage — which product is on show — lives here.
 */

/** Focus on a link that came from the keyboard, not from a click or a tap. */
const keyboardFocus = (el: Element) => {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
};

const fromMouse = (e: React.PointerEvent) => e.pointerType === "mouse" || e.pointerType === "pen";

type Stage = { kind: "root" } | { kind: "group"; groupId: string };

export function MegaPanel({
  id,
  data,
  plat,
  onPlat,
  current,
  onSelect,
  onNavigate,
  packoutHref,
  onPointerEnter,
  onPointerLeave,
}: {
  id: string;
  data: MegaMenuData;
  plat: MenuPlatform;
  onPlat: (p: MenuPlatform) => void;
  current: MegaRoot;
  onSelect: (rootId: string) => void;
  /** A link in the panel was followed: close. */
  onNavigate: () => void;
  packoutHref: string;
  onPointerEnter: () => void;
  onPointerLeave: (e: React.PointerEvent) => void;
}) {
  const t = useTranslations("chrome.MegaMenu");
  const locale = useLocale() as Locale;
  const fmt = (n: number) => formatCount(n, locale);
  const label = platformName(plat, t("oles"));

  const [stage, setStage] = useState<Stage>({ kind: "root" });
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  // The batteries fill from empty once the panel is on screen.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // A new root or platform starts on the root's own stage.
  const stageKeyBase = `${current.id}:${plat}`;
  const [stageBase, setStageBase] = useState(stageKeyBase);
  if (stageBase !== stageKeyBase) {
    setStageBase(stageKeyBase);
    setStage({ kind: "root" });
  }

  // The selected root in view: a header item may open the menu on a root far
  // down the (scrolling) column, under «ΤΑΙΡΙΑΖΟΥΝ ΣΕ ΟΛΑ».
  useEffect(() => {
    document
      .getElementById(id)
      ?.querySelector(`[data-root="${current.id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [id, current.id, plat]);

  const fills = useMemo(() => batteryFills(data.totals), [data.totals]);
  const total = useTween(countFor(data.totals, plat));

  const { fit, uni } = splitRoots(data.roots, plat);
  const universal = isUniversal(current.c, plat);
  const groups = orderGroups(current.groups, plat, universal);
  const rootCount = shownCount(current.c, plat);
  const rootStock = universal ? current.s.all : countFor(current.s, plat);

  /* ── Stage ─────────────────────────────────────────────────────────── */
  const group: MegaGroup | undefined =
    stage.kind === "group" ? current.groups.find((g) => g.id === stage.groupId) : undefined;
  const top = group ? topFor(group, plat, universal) : null;
  const onStage =
    group && top
      ? {
          key: `${group.id}:${plat}`,
          image: top.image,
          big: plat === "all" || universal ? group.c.all : group.c[plat] || group.c.all,
          kicker: t("kicker_omada", { name: group.name }),
          title: top.name,
          code: top.code,
          price: top.price != null ? formatMoney(top.price, locale) : "",
          href: `/proion/${top.slug}`,
        }
      : {
          key: `${current.id}:${plat}`,
          image: current.image,
          big: rootCount,
          kicker: t("kicker_katigoria"),
          title: current.name,
          code: t("omades_apothema", { groups: current.groups.length, stock: current.s.all }),
          price: "",
          href: menuHref(current.href, plat, current.c),
        };
  const big = useTween(onStage.big);

  const showGroup = (g: MegaGroup) => {
    if (topFor(g, plat, universal)) setStage({ kind: "group", groupId: g.id });
  };

  /* ── Strip ─────────────────────────────────────────────────────────── */
  const batteryRoot = data.roots.find((r) => r.id === data.nav.battery);
  const batteryHref = batteryRoot?.href ?? "/katalogos";
  const platformed = (href: string) =>
    plat === "all" || !batteryRoot || !(batteryRoot.c[plat] > 0)
      ? href
      : withParam(href, "platform", plat);

  const rootRow = (root: MegaRoot, uniRow: boolean) => {
    const on = root.id === current.id;
    return (
      <Link
        key={root.id}
        href={menuHref(root.href, plat, root.c)}
        prefetch={false}
        data-root={root.id}
        className={`hdc-mm-root${on ? " is-on" : ""}${uniRow ? " is-uni" : ""}`}
        aria-current={on ? "true" : undefined}
        onPointerEnter={(e) => {
          if (fromMouse(e)) onSelect(root.id);
        }}
        onFocus={(e) => {
          if (keyboardFocus(e.currentTarget)) onSelect(root.id);
        }}
        onClick={(e) => {
          // A tap (no hover before it) selects first; the second one goes.
          if (!on) {
            e.preventDefault();
            onSelect(root.id);
          } else onNavigate();
        }}
      >
        <span className="n">{root.name}</span>
        <span className="c">{fmt(uniRow ? root.c.all : countFor(root.c, plat))}</span>
      </Link>
    );
  };

  return (
    <div
      id={id}
      role="region"
      aria-label={t("perioxi")}
      className="hdc-mm"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="hdc-wrap">
        {/* ── Battery switch ── */}
        <div className="hdc-mm-batbar">
          <div className="hdc-mm-q">
            {t("erotisi")}
            <small>{t("erotisi_sub")}</small>
          </div>
          <div className="hdc-mm-bats" role="group" aria-label={t("diakoptis")}>
            {MENU_PLATFORMS.map((p) => (
              <div key={p} className={`hdc-mm-batwrap${p === plat ? " is-on" : ""}`}>
                <button
                  type="button"
                  className={`hdc-mm-bat${p === plat ? " is-on" : ""}`}
                  aria-pressed={p === plat}
                  onClick={() => onPlat(p)}
                >
                  <span
                    className="fill"
                    style={{ width: `${filled ? fills[p] : 0}%` }}
                    aria-hidden
                  />
                  <b>{platformName(p, t("oles"))}</b>
                  <span>{fmt(data.totals[p])}</span>
                </button>
              </div>
            ))}
          </div>
          <div className="hdc-mm-tot" aria-live="polite">
            <b>{fmt(total)}</b>
            <span>
              {plat === "all" ? t("synolo_ola") : t("synolo_platforma", { platform: label })}
            </span>
          </div>
        </div>

        <div className="hdc-mm-cols">
          {/* ── Roots ── */}
          <div className="hdc-mm-roots">
            {plat === "all" ? (
              fit.map((root) => rootRow(root, false))
            ) : (
              <>
                <h5>{t("gia_tin", { platform: label })}</h5>
                {fit.map((root) => rootRow(root, false))}
                {uni.length > 0 && <h5>{t("tairiazoun_se_ola")}</h5>}
                {uni.map((root) => rootRow(root, true))}
              </>
            )}
          </div>

          {/* ── Groups ── */}
          <div className="hdc-mm-groups">
            <h3 className="hdc-disp">{current.name}</h3>
            <p className="hdc-mm-meta">
              <b>{t("proionta", { n: rootCount })}</b>
              {plat !== "all" && !universal ? ` ${t("gia_platforma", { platform: label })}` : ""}
              {" · "}
              <em>● {t("se_apothema", { n: rootStock })}</em>
              {universal ? ` · ${t("kathe_platforma")}` : ""}
            </p>
            {groups.length > 0 && (
              <div
                key={`${current.id}:${plat}`}
                className="hdc-mm-glist"
                onPointerLeave={() => setStage({ kind: "root" })}
              >
                {groups.map(({ group: g, n }, k) => (
                  <Link
                    key={g.id}
                    href={menuHref(g.href, plat, g.c)}
                    prefetch={false}
                    data-group
                    className={`hdc-mm-g${n ? "" : " is-dim"}`}
                    style={{ animationDelay: `${Math.min(k, 14) * 22}ms` }}
                    onPointerEnter={() => showGroup(g)}
                    onFocus={() => showGroup(g)}
                    onClick={onNavigate}
                  >
                    {g.name}
                    <span>{fmt(n)}</span>
                  </Link>
                ))}
              </div>
            )}
            <Link
              href={menuHref(current.href, plat, current.c)}
              prefetch={false}
              className="hdc-mm-allcat"
              onClick={onNavigate}
            >
              {current.groups.length ? t("oli_i_katigoria") : t("deite_ta", { n: current.c.all })} →
            </Link>
          </div>

          {/* ── Stage ── */}
          <div className="hdc-mm-stage">
            <div className="hdc-mm-big" aria-hidden>
              {fmt(big)}
            </div>
            <div className="hdc-mm-shot">
              {onStage.image && !failed.has(onStage.image) && (
                // eslint-disable-next-line @next/next/no-img-element -- CDN WebP; the optimiser is off
                <img
                  key={onStage.key}
                  className="in"
                  src={onStage.image}
                  alt=""
                  onError={() => setFailed((prev) => new Set(prev).add(onStage.image!))}
                />
              )}
            </div>
            <div className="hdc-mm-cap">
              <div className="k">{onStage.kicker}</div>
              <span className="hdc-slant hdc-mm-tag">{plat === "all" ? "MILWAUKEE" : label}</span>
              <h4>{onStage.title}</h4>
              <div className="code">{onStage.code}</div>
              <div className="row">
                <span className="p">{onStage.price}</span>
                <Link href={onStage.href} prefetch={false} className="go" onClick={onNavigate}>
                  {t("deite_to")} →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── Strip ── */}
        <nav className="hdc-mm-strip" aria-label={t("grigoroi")}>
          <Link href="/nees-afixeis" prefetch={false} className="hot" onClick={onNavigate}>
            {t("nees_afixeis")}
          </Link>
          <Link href="/prosfores" prefetch={false} onClick={onNavigate}>
            {t("prosfores")}
          </Link>
          <Link
            href={platformed(withParam(batteryHref, "series", "onekey"))}
            prefetch={false}
            onClick={onNavigate}
          >
            ONE-KEY™
          </Link>
          <Link href={packoutHref} prefetch={false} onClick={onNavigate}>
            PACKOUT™
          </Link>
          <Link
            href={platformed(withParam(batteryHref, "content", "kit"))}
            prefetch={false}
            onClick={onNavigate}
          >
            {t("set_kit")}
          </Link>
          <span className="kb" aria-hidden>
            {t("pliktrologio")} <b>↑</b>
            <b>↓</b>
            <b>→</b> · {t("kleisimo_me")} <b>Esc</b>
          </span>
        </nav>
      </div>
    </div>
  );
}
