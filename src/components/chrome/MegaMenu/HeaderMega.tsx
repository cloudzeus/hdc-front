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
import { neighbour, type Direction } from "./keys";
import { MegaPanel } from "./MegaPanel";
import { MegaFailed, MegaSkeleton } from "./MegaStates";

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
 * It closes on Esc (focus returns to the item), a click outside, focus
 * leaving header and panel, a followed link and a route change. On the items,
 * ←→ move along the header (and switch the open menu with them), ↓ enters.
 * In the panel ↑↓ walk the roots, → enters the groups, where the arrows move
 * on the grid as it is laid out on screen, and ← at its edge returns.
 *
 * Touch screens from 1024px get this same panel, opened and driven by taps
 * (hover intent listens to a mouse only); below 1024px the header hands over
 * to the drawer (MobileMenu), tablets included — one model per width.
 *
 * The data is fetched on first intent, not shipped with every page. While it
 * is on its way the panel opens on a skeleton of itself; if it fails, the
 * panel says so and offers another try and the page itself.
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
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  /** The item the menu was opened from (and returns focus to). */
  const [openKey, setOpenKey] = useState<MegaNavKey | null>(null);
  const [openedBy, setOpenedBy] = useState<"hover" | "click">("click");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [plat, choosePlat, syncPlat] = usePlatformChoice(open);

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
  const focusRetry = useRef(false);

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

  const fallback = (key: MegaNavKey, by: "hover" | "click") => {
    // No root for this item: it behaves as the link it replaces.
    const item = items.find((i) => i.key === key);
    if (item && by === "click") router.push(item.href);
  };

  /*
   * Opening needs the data. It is usually in memory already (idle warm-up,
   * hover); when it is not, the panel opens on its skeleton and fills in as
   * soon as the data arrives — for the item asked for last, if the pointer
   * or the arrows moved on meanwhile.
   */
  const openOn = (key: MegaNavKey, by: "hover" | "click", focus = false) => {
    clearTimers();
    const token = ++intent.current;
    intentBy.current = by;
    trigger.current = key;

    const show = (menu: MegaMenuData) => {
      const want = trigger.current ?? key;
      const rootId = menu.nav[want as MegaNavKey];
      if (!rootId) {
        setOpen(false);
        fallback(want as MegaNavKey, by);
        return;
      }
      setData(menu);
      setFailed(false);
      setOpenedBy(by);
      setOpenKey(want as MegaNavKey);
      setCurrentId(rootId);
      setOpen(true);
      if (focus) {
        focusAfterRender.current = rootId;
        setFocusTick((n) => n + 1);
      }
    };

    if (!open) syncPlat();
    if (data) {
      show(data);
      return;
    }
    setOpenedBy(by);
    setOpenKey(key);
    setCurrentId(null);
    setFailed(false);
    setOpen(true);
    loadMegaMenu(locale).then((menu) => {
      if (token !== intent.current) {
        if (menu) setData(menu);
        return;
      }
      if (menu) show(menu);
      else {
        setFailed(true);
        if (focus) {
          focusRetry.current = true;
          setFocusTick((n) => n + 1);
        }
      }
    });
  };

  const retry = () => {
    if (trigger.current) openOn(trigger.current as MegaNavKey, "click", true);
  };


  useEffect(() => {
    if (!open) return;
    const panel = document.getElementById(panelId);
    if (failed) {
      // Opened from the keyboard onto a failure: the retry button takes it.
      if (focusRetry.current) {
        focusRetry.current = false;
        panel?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
      }
      return;
    }
    const rootId = focusAfterRender.current;
    if (!rootId) return;
    const row = panel?.querySelector<HTMLElement>(`[data-root="${rootId}"]`);
    if (!row) return; // not rendered yet (skeleton): the next render tries again
    focusAfterRender.current = null;
    row.focus();
  }, [open, currentId, focusTick, panelId, failed]);

  // Any navigation closes it.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }

  // Warm the data when the browser is idle, wherever this header is shown
  // (from 1024px — a tablet in landscape as much as a desktop).
  useEffect(() => {
    if (!window.matchMedia?.("(min-width: 1024px)").matches) return;
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

  /* ── Outside click, focus leaving, keys ─────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (navRef.current?.contains(target) || panelWrapRef.current?.contains(target));

    const onDown = (e: PointerEvent) => {
      if (!inside(e.target)) close();
    };

    // Tab past the last link (or Shift+Tab before the first item): the menu
    // does not stay open behind the focus.
    const onFocusIn = (e: FocusEvent) => {
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
      // The switch is a radiogroup and moves on its own arrows.
      if (active instanceof HTMLElement && active.closest('[role="radiogroup"]')) return;

      const panel = document.getElementById(panelId);
      const focusRoot = (id: string) =>
        panel?.querySelector<HTMLElement>(`[data-root="${id}"]`)?.focus();
      const inGrid = active instanceof HTMLElement && active.hasAttribute("data-gnav");

      // In the groups: the nearest link on screen in the arrow's direction.
      if (inGrid && e.key.startsWith("Arrow")) {
        const links = [...(panel?.querySelectorAll<HTMLElement>("[data-gnav]") ?? [])];
        const boxes = links.map((el) => {
          const b = el.getBoundingClientRect();
          return { x: b.left, y: b.top, w: b.width, h: b.height };
        });
        const dir = e.key.slice(5).toLowerCase() as Direction;
        const next = neighbour(boxes, links.indexOf(active as HTMLElement), dir);
        e.preventDefault();
        if (next >= 0) links[next].focus();
        else if (dir === "left") focusRoot(current.id);
        return;
      }

      const seq = rootSequence(data.roots, plat);
      const go = (next: (typeof seq)[number] | undefined) => {
        if (!next) return;
        setCurrentId(next.id);
        focusRoot(next.id);
      };
      const at = seq.findIndex((r) => r.id === current.id);

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        go(e.key === "ArrowDown" ? seq[Math.min(seq.length - 1, at + 1)] : seq[Math.max(0, at - 1)]);
      } else if ((e.key === "Home" || e.key === "End") && active?.hasAttribute("data-root")) {
        e.preventDefault();
        go(e.key === "Home" ? seq[0] : seq[seq.length - 1]);
      } else if (e.key === "ArrowRight") {
        const first = panel?.querySelector<HTMLElement>("[data-gnav]");
        if (first) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("focusin", onFocusIn);
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
      // Already open: the header behaves as a tab strip (and a panel still
      // loading will open on this item).
      trigger.current = key;
      setOpenKey(key);
      const rootId = data?.nav[key];
      if (rootId) setCurrentId(rootId);
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
    if (open && openKey === key && openedBy === "click" && (!rootId || rootId === current?.id)) {
      close();
      return;
    }
    if (open && rootId) {
      // Opened by hover (or on another item), clicked: it now stays, here.
      trigger.current = key;
      setOpenKey(key);
      setOpenedBy("click");
      setCurrentId(rootId);
      return;
    }
    // `detail === 0`: Enter or Space, not a pointer — take the focus inside.
    openOn(key, "click", e.detail === 0);
  };

  const onItemKey = (e: React.KeyboardEvent, key: MegaNavKey) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Along the header, as a menubar: the open menu follows the focus.
      e.preventDefault();
      e.stopPropagation();
      const keys = items.filter((i) => isMenuKey(i.key)).map((i) => i.key as MegaNavKey);
      const at = keys.indexOf(key);
      const next = keys[(at + (e.key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length];
      triggers.current.get(next)?.focus();
      if (open) {
        trigger.current = next;
        setOpenKey(next);
        const rootId = data?.nav[next];
        if (rootId) setCurrentId(rootId);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key !== "ArrowDown") return;
    // ↓ on an item enters the menu at its root; the document's ↑↓ take over there.
    e.preventDefault();
    e.stopPropagation();
    const rootId = data?.nav[key];
    if (open && rootId) {
      trigger.current = key;
      setOpenKey(key);
      focusAfterRender.current = rootId;
      setCurrentId(rootId);
      setFocusTick((n) => n + 1);
    } else openOn(key, "click", true);
  };

  // The item drawn as open: the one whose root is on show (↑↓ may walk the
  // panel onto another item's root), else the one it was opened from.
  const activeKey = !open
    ? undefined
    : current
      ? MENU_KEYS.find((k) => data?.nav[k] === current.id)
      : (openKey ?? undefined);
  const openItem = items.find((i) => i.key === openKey);

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
              aria-expanded={open && openKey === key}
              aria-controls={open && openKey === key ? panelId : undefined}
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
        data-open={open ? "true" : "false"}
      >
        {open && (
          <>
            <button
              type="button"
              className="hdc-mm-backdrop"
              tabIndex={-1}
              aria-hidden
              onClick={() => close()}
            />
            {data && current ? (
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
            ) : (
              <div onPointerEnter={onRegionEnter} onPointerLeave={onRegionLeave}>
                {failed ? (
                  <MegaFailed
                    id={panelId}
                    onRetry={retry}
                    href={openItem?.href ?? "/katalogos"}
                    label={openItem?.label ?? ""}
                    onNavigate={() => close()}
                  />
                ) : (
                  <MegaSkeleton id={panelId} />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
