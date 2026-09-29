"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  batteryFills,
  countFor,
  formatCount,
  isUniversal,
  menuHref,
  orderGroups,
  platformName,
  rowFit,
  shownCount,
  splitRoots,
  topFor,
  withParam,
  type MegaGroup,
  type MegaMenuData,
  type MegaRoot,
  type MenuPlatform,
  type RowFit,
} from "@/lib/catalog/mega-menu-core";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/routing";
import { preloadImages, useFlip, useTween } from "./data";
import { PlatformSwitch } from "./PlatformSwitch";

/**
 * The desktop mega menu panel (mockup megamenu.html `.mega`): the battery
 * switch, the roots, the groups of the selected root, the «stage», and the
 * strip of shortcuts. Everything re-counts for the platform the switch holds.
 *
 * Adaptive, not one breakpoint: the panel is a size container, and its
 * columns follow the room it actually has (megamenu.css) — the stage narrows
 * and then gives way before the groups get cramped, the groups reflow from
 * three columns to one, and the panel never grows past the window: the switch
 * and the strip stay put while the two lists scroll inside their columns.
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

/** A pointer resting on a group this long puts its product on the stage. */
const STAGE_HOVER_MS = 70;

type Stage = { kind: "root" } | { kind: "group"; groupId: string };

/** A count that runs to its new value when the platform changes it. */
function Count({ n, format }: { n: number; format: (n: number) => string }) {
  return <>{format(useTween(n, 380, false))}</>;
}

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
  const stageTimer = useRef<number | null>(null);
  const rootsRef = useRef<HTMLDivElement | null>(null);
  const groupsRef = useRef<HTMLDivElement | null>(null);

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

  // The selected root in view (a header item may open the menu on a root far
  // down the scrolling column), and a new root's groups from their top.
  useEffect(() => {
    const row = rootsRef.current?.querySelector<HTMLElement>(`[data-root="${current.id}"]`);
    const box = rootsRef.current;
    if (row && box) {
      const top = row.offsetTop;
      const bottom = top + row.offsetHeight;
      if (top < box.scrollTop) box.scrollTop = top - 12;
      else if (bottom > box.scrollTop + box.clientHeight)
        box.scrollTop = bottom - box.clientHeight + 12;
    }
  }, [current.id, plat]);
  useEffect(() => {
    groupsRef.current?.scrollTo({ top: 0 });
  }, [current.id]);

  // The roots slide to their new places when the platform re-orders them.
  useFlip(rootsRef, plat);

  const fills = useMemo(() => batteryFills(data.totals), [data.totals]);
  const noFill = useMemo(() => ({ all: 0, M12: 0, M18: 0, MX: 0 }), []);
  const total = useTween(countFor(data.totals, plat));

  const { fit, uni, off } = splitRoots(data.roots, plat);
  const universal = isUniversal(current.c, plat);
  const groups = orderGroups(current.groups, plat);
  const rootCount = shownCount(current.c, plat);
  const rootStock = universal ? current.s.all : countFor(current.s, plat);

  // The photos the groups are about to show, fetched ahead of the hover.
  useEffect(() => {
    preloadImages(
      orderGroups(current.groups, plat)
        .slice(0, 12)
        .map(({ group, fit: f }) => topFor(group, plat, f !== "fit")?.image),
    );
  }, [current, plat]);

  /* ── Stage ─────────────────────────────────────────────────────────── */
  const shownGroup =
    stage.kind === "group" ? groups.find((row) => row.group.id === stage.groupId) : undefined;
  const top = shownGroup ? topFor(shownGroup.group, plat, shownGroup.fit !== "fit") : null;
  const onStage =
    shownGroup && top
      ? {
          key: `${shownGroup.group.id}:${plat}:${top.slug}`,
          image: top.image,
          big: shownGroup.n || shownGroup.group.c.all,
          kicker: t("kicker_omada", { name: shownGroup.group.name }),
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

  // The photo leaving the stage stays a moment, to cross-fade with the next.
  const [shot, setShot] = useState({ key: onStage.key, image: onStage.image });
  const [leaving, setLeaving] = useState<{ key: string; image: string | null } | null>(null);
  if (shot.key !== onStage.key) {
    setLeaving(shot.image && shot.image !== onStage.image ? shot : null);
    setShot({ key: onStage.key, image: onStage.image });
  }
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), 360);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const clearStageTimer = () => {
    if (stageTimer.current) window.clearTimeout(stageTimer.current);
    stageTimer.current = null;
  };
  useEffect(() => clearStageTimer, []);

  const showGroup = (g: MegaGroup, fit: RowFit, delay = 0) => {
    clearStageTimer();
    if (!topFor(g, plat, fit !== "fit")) return;
    if (delay === 0) setStage({ kind: "group", groupId: g.id });
    else
      stageTimer.current = window.setTimeout(
        () => setStage({ kind: "group", groupId: g.id }),
        delay,
      );
  };

  /* ── Strip ─────────────────────────────────────────────────────────── */
  const batteryRoot = data.roots.find((r) => r.id === data.nav.battery);
  const batteryHref = batteryRoot?.href ?? "/katalogos";
  const platformed = (href: string) =>
    plat === "all" || !batteryRoot || !(batteryRoot.c[plat] > 0)
      ? href
      : withParam(href, "platform", plat);

  const rootRow = (root: MegaRoot, kind: RowFit) => {
    const on = root.id === current.id;
    return (
      <Link
        key={root.id}
        href={menuHref(root.href, plat, root.c)}
        prefetch={false}
        data-root={root.id}
        data-flip={`r:${root.id}`}
        className={`hdc-mm-root${on ? " is-on" : ""}${kind === "fit" ? "" : ` is-${kind}`}`}
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
        <span className="c">
          <Count n={shownCount(root.c, plat)} format={fmt} />
        </span>
      </Link>
    );
  };

  const heading = (key: string, text: string) => (
    <h5 key={key} data-flip={`h:${key}`}>
      {text}
    </h5>
  );

  const firstUniGroup = groups.findIndex((row) => row.fit === "uni");
  const showUniHeading = plat !== "all" && !universal && firstUniGroup > 0;

  return (
    <div
      id={id}
      role="region"
      aria-label={t("perioxi")}
      className="hdc-mm"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="hdc-wrap hdc-mm-wrap">
        {/* ── Battery switch ── */}
        <div className="hdc-mm-batbar">
          <div className="hdc-mm-q">
            {t("erotisi")}
            <small>{t("erotisi_sub")}</small>
          </div>
          <PlatformSwitch
            variant="bats"
            plat={plat}
            onPlat={onPlat}
            totals={data.totals}
            fills={filled ? fills : noFill}
            format={fmt}
          />
          <div className="hdc-mm-tot">
            <b aria-hidden>{fmt(total)}</b>
            <span>
              {plat === "all" ? t("synolo_ola") : t("synolo_platforma", { platform: label })}
            </span>
            <span className="sr-only" aria-live="polite">
              {fmt(countFor(data.totals, plat))}{" "}
              {plat === "all" ? t("synolo_ola") : t("synolo_platforma", { platform: label })}
            </span>
          </div>
        </div>

        <div className="hdc-mm-cols">
          {/* ── Roots ── */}
          <div className="hdc-mm-roots" ref={rootsRef}>
            {plat === "all" ? (
              fit.map((root) => rootRow(root, "fit"))
            ) : (
              <>
                {fit.length > 0 && heading("fit", t("gia_tin", { platform: label }))}
                {fit.map((root) => rootRow(root, "fit"))}
                {uni.length > 0 && heading("uni", t("tairiazoun_se_ola"))}
                {uni.map((root) => rootRow(root, "uni"))}
                {off.length > 0 && heading("off", t("alles_platformes"))}
                {off.map((root) => rootRow(root, "off"))}
              </>
            )}
          </div>

          {/* ── Groups ── */}
          <div className="hdc-mm-groups" ref={groupsRef}>
            <h3 className="hdc-disp">{current.name}</h3>
            <p className="hdc-mm-meta">
              <b>{t("proionta", { n: rootCount })}</b>
              {plat !== "all" && !universal ? ` ${t("gia_platforma", { platform: label })}` : ""}
              {" · "}
              <em>● {t("se_apothema", { n: rootStock })}</em>
              {rowFit(current.c, plat) === "uni" ? ` · ${t("kathe_platforma")}` : ""}
            </p>
            {groups.length > 0 && (
              <div
                key={`${current.id}:${plat}`}
                className="hdc-mm-glist"
                onPointerLeave={() => {
                  clearStageTimer();
                  setStage({ kind: "root" });
                }}
              >
                {groups.map(({ group: g, n, fit: f }, k) => (
                  <GroupLink
                    key={g.id}
                    href={menuHref(g.href, plat, g.c)}
                    name={g.name}
                    count={fmt(n)}
                    fit={f}
                    delay={Math.min(k, 14) * 22}
                    heading={showUniHeading && k === firstUniGroup ? t("tairiazoun_se_ola") : null}
                    on={stage.kind === "group" && stage.groupId === g.id}
                    onEnter={(e) => {
                      if (fromMouse(e)) showGroup(g, f, STAGE_HOVER_MS);
                    }}
                    onFocus={() => showGroup(g, f)}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
            <Link
              href={menuHref(current.href, plat, current.c)}
              prefetch={false}
              className="hdc-mm-allcat"
              data-gnav
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
              {leaving?.image && !failed.has(leaving.image) && (
                // eslint-disable-next-line @next/next/no-img-element -- CDN WebP; the optimiser is off
                <img key={`out:${leaving.key}`} className="out" src={leaving.image} alt="" />
              )}
              {shot.image && !failed.has(shot.image) && (
                // eslint-disable-next-line @next/next/no-img-element -- CDN WebP; the optimiser is off
                <img
                  key={shot.key}
                  className="in"
                  src={shot.image}
                  alt=""
                  onError={() => setFailed((prev) => new Set(prev).add(shot.image!))}
                />
              )}
            </div>
            <div className="hdc-mm-cap" key={onStage.key}>
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
            <b>←</b>
            <b>→</b> · {t("kleisimo_me")} <b>Esc</b>
          </span>
        </nav>
      </div>
    </div>
  );
}

function GroupLink({
  href,
  name,
  count,
  fit,
  delay,
  heading,
  on,
  onEnter,
  onFocus,
  onNavigate,
}: {
  href: string;
  name: string;
  count: string;
  fit: RowFit;
  delay: number;
  /** «ΤΑΙΡΙΑΖΟΥΝ ΣΕ ΟΛΑ» over the first group that fits every platform. */
  heading: string | null;
  on: boolean;
  onEnter: (e: React.PointerEvent) => void;
  onFocus: () => void;
  onNavigate: () => void;
}) {
  return (
    <>
      {heading && (
        <h5 className="hdc-mm-gsep" style={{ animationDelay: `${delay}ms` }}>
          {heading}
        </h5>
      )}
      <Link
        href={href}
        prefetch={false}
        data-group
        data-gnav
        className={`hdc-mm-g${fit === "fit" ? "" : fit === "uni" ? " is-uni" : " is-dim"}${
          on ? " is-on" : ""
        }`}
        style={{ animationDelay: `${delay}ms` }}
        onPointerEnter={onEnter}
        onFocus={onFocus}
        onClick={onNavigate}
      >
        <span className="n">{name}</span>
        <span className="c">{count}</span>
      </Link>
    </>
  );
}
