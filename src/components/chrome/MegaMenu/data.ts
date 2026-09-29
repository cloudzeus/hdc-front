"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MegaMenuData, MenuPlatform } from "@/lib/catalog/mega-menu-core";
import { readPlatformCookie, writePlatformCookie } from "@/lib/catalog/platform-cookie";

/*
 * One request per language per page session. The header re-mounts on every
 * client navigation (each page renders its own chrome), so the promise lives
 * at module level: the menu is fetched once and every later page reuses it.
 * A failure is not remembered — the next intent tries again.
 */
const pending = new Map<string, Promise<MegaMenuData | null>>();

export function loadMegaMenu(locale: string): Promise<MegaMenuData | null> {
  let promise = pending.get(locale);
  if (!promise) {
    promise = fetch(`/api/mega-menu?locale=${encodeURIComponent(locale)}`)
      .then((response) => (response.ok ? response.json() : { menu: null }))
      .then((body: { menu: MegaMenuData | null }) => {
        if (!body.menu) pending.delete(locale);
        return body.menu;
      })
      .catch(() => {
        pending.delete(locale);
        return null;
      });
    pending.set(locale, promise);
  }
  return promise;
}

export type MenuStatus = "idle" | "loading" | "ready" | "failed";

/** The menu once `wanted` turns true; `status` says how far it got. */
export function useMegaMenuData(locale: string, wanted: boolean) {
  const [data, setData] = useState<MegaMenuData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!wanted || data) return;
    let live = true;
    loadMegaMenu(locale).then((menu) => {
      if (!live) return;
      setData(menu);
      setFailed(!menu);
    });
    return () => {
      live = false;
    };
  }, [locale, wanted, data]);

  const status: MenuStatus = data ? "ready" : failed ? "failed" : wanted ? "loading" : "idle";
  return { data, status };
}

/**
 * The platform switch's state, read from the cookie every time the menu opens
 * (a category page may have changed it meanwhile), and written back on every
 * change («ΟΛΕΣ» forgets it).
 */
export function usePlatformChoice(active: boolean) {
  const [plat, setPlat] = useState<MenuPlatform>("all");

  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the cookie is only readable in the browser
    setPlat(readPlatformCookie() ?? "all");
  }, [active]);

  const choose = (next: MenuPlatform) => {
    setPlat(next);
    writePlatformCookie(next);
  };

  /*
   * The same read, on demand: the header calls it in the same update that
   * opens the panel, so the roots render in the remembered platform's order
   * from the first frame. Re-ordered a frame later, React would move the
   * focused root in the DOM — and the browser drops the focus of a moved
   * element.
   */
  const sync = () => setPlat(readPlatformCookie() ?? "all");

  return [plat, choose, sync] as const;
}

/** The visitor asked for less motion. Browser only; false on the server. */
export const reducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

export const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * A number that runs from its last value to the next (mockup `tween`: 380 ms,
 * ease-out cubic). With reduced motion it simply changes.
 *
 * `fromZero`: the first value also runs up from 0, as the mockup's big
 * counters do. Off for the counts in the rows, which appear as they are and
 * only run when the platform changes them.
 */
export function useTween(target: number, duration = 380, fromZero = true): number {
  // From 0 (or the target) on first show; afterwards from whatever is on
  // screen, so an interrupted run carries on smoothly.
  const [shown, setShown] = useState(fromZero ? 0 : target);
  const current = useRef(fromZero ? 0 : target);

  useEffect(() => {
    const start = current.current;
    if (start === target) return;
    const put = (value: number) => {
      current.current = value;
      setShown(value);
    };
    if (reducedMotion()) {
      put(target);
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      put(Math.round(start + (target - start) * eased));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return shown;
}

/**
 * FLIP for a list that re-orders: when `trigger` changes (the platform), every
 * element carrying `data-flip` slides from where it was to where it is now,
 * and the ones that were not there fade in. Positions are `offsetTop`, so a
 * scrolled column measures the same. Nothing moves under reduced motion.
 */
export function useFlip(box: React.RefObject<HTMLElement | null>, trigger: string) {
  const last = useRef(new Map<string, number>());
  const lastTrigger = useRef(trigger);

  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>("[data-flip]")];
    const now = new Map(items.map((el) => [el.dataset.flip!, el.offsetTop]));

    if (lastTrigger.current !== trigger && !reducedMotion() && typeof root.animate === "function") {
      for (const el of items) {
        const before = last.current.get(el.dataset.flip!);
        const after = now.get(el.dataset.flip!)!;
        if (before === undefined) {
          el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: EASE });
        } else if (before !== after) {
          el.animate(
            [{ transform: `translateY(${before - after}px)` }, { transform: "none" }],
            { duration: 380, easing: EASE },
          );
        }
      }
    }
    lastTrigger.current = trigger;
    last.current = now;
  });
}

/** Warms the browser cache with the photos a hover is about to ask for. */
const warmed = new Set<string>();
export function preloadImages(urls: Array<string | null | undefined>) {
  if (typeof window === "undefined") return;
  for (const url of urls) {
    if (!url || warmed.has(url)) continue;
    warmed.add(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}
