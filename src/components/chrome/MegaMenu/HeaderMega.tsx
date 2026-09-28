"use client";

import { useLocale } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  rootSequence,
  type MegaMenuData,
  type MegaNavKey,
  type MenuPlatform,
} from "@/lib/catalog/mega-menu-core";
import { isHdcNavActive, type HdcNavKey } from "@/lib/hdc-nav";
import { loadMegaMenu, usePlatformChoice } from "./data";
import { MegaPanel } from "./MegaPanel";

/**
 * The header's five items and the mega menu they open (mockup megamenu.html).
 *
 * ΕΡΓΑΛΕΙΑ ΜΠΑΤΑΡΙΑΣ, ΑΞΕΣΟΥΑΡ, PACKOUT and ΧΕΙΡΟΣ are buttons that open the
 * menu on their own root; ΠΡΟΣΦΟΡΕΣ stays a link. The menu opens:
 *
 *  - on click (and Enter / Space, and ↓ on a focused item),
 *  - on hover intent with a fine pointer — a short rest on the item, so
 *    sweeping the mouse across the header does not flash it open. Opened
 *    that way it also closes when the pointer has left header and panel
 *    for a moment; opened by click it stays until dismissed.
 *
 * It closes on Esc (focus returns to the item), a click outside, a followed
 * link and a route change. ↑↓ walk the roots, → enters the groups, ← returns.
 *
 * The data is fetched on first intent, not shipped with every page.
 */

const MENU_KEYS: MegaNavKey[] = ["battery", "accessories", "packout", "hand"];
const isMenuKey = (key: HdcNavKey): key is MegaNavKey => (MENU_KEYS as string[]).includes(key);
const HOVER_OPEN_MS = 140;
const HOVER_CLOSE_MS = 350;

type Item = { key: HdcNavKey; href: string; label: string };

export function HeaderMega({
  label,
  items,
  packoutHref,
}: {
  label: string;
  items: Item[];
  packoutHref: string;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const panelId = useId();

  const [data, setData] = useState<MegaMenuData | null>(null);
  const [open, setOpen] = useState(false);
  const [openedBy, setOpenedBy] = useState<"hover" | "click">("click");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [plat, choosePlat] = usePlatformChoice(open);

  const navRef = useRef<HTMLElement | null>(null);
  const panelWrapRef = useRef<HTMLDivElement | null>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const trigger = useRef<string | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  /** The latest request to open; a slower, older one must not win. */
  const intent = useRef(0);
  const intentBy = useRef<"hover" | "click">("click");
  /** A root to focus once the panel has rendered (opened from the keyboard). */
  const focusAfterRender = useRef<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);

  const clearTimers = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = closeTimer.current = null;
  };

  const close = useCallback((returnFocus = false) => {
    clearTimers();
    intent.current += 1;
    setOpen(false);
    if (returnFocus && trigger.current) triggers.current.get(trigger.current)?.focus();
  }, []);

  const warm = () => {
    loadMegaMenu(locale).then((menu) => {
      if (menu) setData(menu);
    });
  };

  /*
   * Opening needs the data. It is usually in memory already (idle warm-up,
   * hover); when it is not, the menu opens as soon as it arrives — unless
   * something else was asked for in the meantime.
   */
  const openOn = (key: MegaNavKey, by: "hover" | "click", focus = false) => {
    clearTimers();
    const token = ++intent.current;
    intentBy.current = by;
    trigger.current = key;
    loadMegaMenu(locale).then((menu) => {
      if (token !== intent.current) return;
      const rootId = menu?.nav[key];
      if (!menu || !rootId) {
        // No tree, or no root for this item: it behaves as the link it replaces.
        const item = items.find((i) => i.key === key);
        if (item && by === "click") router.push(item.href);
        return;
      }
      setData(menu);
      setOpenedBy(by);
      setCurrentId(rootId);
      setOpen(true);
      if (focus) focusAfterRender.current = rootId;
    });
  };

  useEffect(() => {
    const rootId = focusAfterRender.current;
    if (!open || !rootId) return;
    focusAfterRender.current = null;
    document
      .getElementById(panelId)
      ?.querySelector<HTMLElement>(`[data-root="${rootId}"]`)
      ?.focus();
  }, [open, currentId, focusTick, panelId]);

  // Any navigation closes it.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }

  // Warm the data when the browser is idle, on desktops only.
  useEffect(() => {
    if (!window.matchMedia?.("(min-width: 1024px) and (pointer: fine)").matches) return;
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => loadMegaMenu(locale), { timeout: 4000 })
      : window.setTimeout(() => loadMegaMenu(locale), 2500);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [locale]);

  const current = data && currentId ? (data.roots.find((r) => r.id === currentId) ?? null) : null;

  const selectRoot = (id: string) => setCurrentId(id);

  const onPlat = (next: MenuPlatform) => {
    choosePlat(next);
    // A root with nothing for the new platform gives way to the first that has.
    if (data && current && next !== "all" && !(current.c[next] > 0)) {
      const first = rootSequence(data.roots, next)[0];
      if (first) setCurrentId(first.id);
    }
  };

  /* ── Outside click, keys ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (navRef.current?.contains(target) || panelWrapRef.current?.contains(target));

    const onDown = (e: PointerEvent) => {
      if (!inside(e.target)) close();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
        return;
      }
      if (!data || !current) return;
      const active = document.activeElement;
      const typing =
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
      if (typing) return;
      if (active && active !== document.body && !inside(active)) return;

      const panel = document.getElementById(panelId);
      const focusRoot = (id: string) =>
        panel?.querySelector<HTMLElement>(`[data-root="${id}"]`)?.focus();

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const seq = rootSequence(data.roots, plat);
        const at = seq.findIndex((r) => r.id === current.id);
        const next =
          e.key === "ArrowDown" ? seq[Math.min(seq.length - 1, at + 1)] : seq[Math.max(0, at - 1)];
        if (next) {
          setCurrentId(next.id);
          focusRoot(next.id);
        }
      } else if (e.key === "ArrowRight") {
        const first = panel?.querySelector<HTMLElement>("[data-group]");
        if (first && !(active instanceof HTMLElement && active.hasAttribute("data-group"))) {
          e.preventDefault();
          first.focus();
        }
      } else if (e.key === "ArrowLeft") {
        if (active instanceof HTMLElement && active.hasAttribute("data-group")) {
          e.preventDefault();
          focusRoot(current.id);
        }
      }
    };

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, data, current, plat, panelId, close]);

  /* ── Hover intent ────────────────────────────────────────────────────── */
  const fine = () => window.matchMedia?.("(pointer: fine)").matches ?? false;

  const onItemEnter = (e: React.PointerEvent, key: MegaNavKey) => {
    if (e.pointerType !== "mouse" || !fine()) return;
    warm();
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    if (open) {
      // Already open: the header behaves as a tab strip.
      const rootId = data?.nav[key];
      if (rootId) {
        trigger.current = key;
        setCurrentId(rootId);
      }
      return;
    }
    if (openTimer.current) window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => openOn(key, "hover"), HOVER_OPEN_MS);
  };

  const onItemLeave = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    openTimer.current = null;
    // A hover that has not opened the menu yet is abandoned; a click is not.
    if (!open && intentBy.current === "hover") intent.current += 1;
  };

  const onRegionEnter = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const onRegionLeave = (e: React.PointerEvent) => {
    if (!open || openedBy !== "hover" || e.pointerType !== "mouse") return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => close(), HOVER_CLOSE_MS);
  };

  const onItemClick = (e: React.MouseEvent, key: MegaNavKey) => {
    const rootId = data?.nav[key];
    if (open && rootId && rootId === current?.id && openedBy === "click") {
      close();
      return;
    }
    if (open && rootId) {
      // Opened by hover, clicked: it now stays.
      trigger.current = key;
      setOpenedBy("click");
      setCurrentId(rootId);
      return;
    }
    // `detail === 0`: Enter or Space, not a pointer — take the focus inside.
    openOn(key, "click", e.detail === 0);
  };

  const onItemKey = (e: React.KeyboardEvent, key: MegaNavKey) => {
    if (e.key !== "ArrowDown") return;
    // ↓ on an item enters the menu at its root; the document's ↑↓ take over there.
    e.preventDefault();
    e.stopPropagation();
    const rootId = data?.nav[key];
    if (open && rootId) {
      trigger.current = key;
      focusAfterRender.current = rootId;
      setCurrentId(rootId);
      setFocusTick((n) => n + 1);
    } else openOn(key, "click", true);
  };

  const activeKey =
    open && current ? MENU_KEYS.find((k) => data?.nav[k] === current.id) : undefined;

  return (
    <>
      <nav
        ref={navRef}
        aria-label={label}
        className="hdc-nav hdc-nav--mega"
        onPointerEnter={onRegionEnter}
        onPointerLeave={onRegionLeave}
      >
        {items.map((item) => {
          const current = isHdcNavActive(item.href, pathname);
          if (!isMenuKey(item.key)) {
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={current ? "page" : undefined}
                prefetch={false}
              >
                {item.label}
              </Link>
            );
          }
          const key = item.key;
          const on = activeKey === key;
          return (
            <button
              key={key}
              ref={(el) => {
                if (el) triggers.current.set(key, el);
                else triggers.current.delete(key);
              }}
              type="button"
              className={on ? "is-on" : undefined}
              data-current={current ? "true" : undefined}
              aria-expanded={on}
              aria-controls={on ? panelId : undefined}
              onPointerEnter={(e) => onItemEnter(e, key)}
              onPointerLeave={onItemLeave}
              onFocus={warm}
              onClick={(e) => onItemClick(e, key)}
              onKeyDown={(e) => onItemKey(e, key)}
            >
              {item.label}
              <i aria-hidden>
                <svg viewBox="0 0 10 6" width="9" height="6">
                  <path d="M0 0h10L5 6z" fill="currentColor" />
                </svg>
              </i>
            </button>
          );
        })}
      </nav>

      <div
        ref={panelWrapRef}
        className="hdc-mm-layer"
        data-open={open && current ? "true" : "false"}
      >
        {open && data && current && (
          <>
            <button
              type="button"
              className="hdc-mm-backdrop"
              tabIndex={-1}
              aria-hidden
              onClick={() => close()}
            />
            <MegaPanel
              id={panelId}
              data={data}
              plat={plat}
              onPlat={onPlat}
              current={current}
              onSelect={selectRoot}
              onNavigate={() => close()}
              packoutHref={packoutHref}
              onPointerEnter={onRegionEnter}
              onPointerLeave={onRegionLeave}
            />
          </>
        )}
      </div>
    </>
  );
}
