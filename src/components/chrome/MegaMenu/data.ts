"use client";

import { useEffect, useRef, useState } from "react";
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

  return [plat, choose] as const;
}

/**
 * A number that runs from its last value to the next (mockup `tween`: 380 ms,
 * ease-out cubic). With reduced motion it simply changes.
 */
export function useTween(target: number, duration = 380): number {
  // From 0 on first show, as the mockup's counter does; afterwards from
  // whatever is on screen, so an interrupted run carries on smoothly.
  const [shown, setShown] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    const start = current.current;
    if (start === target) return;
    const put = (value: number) => {
      current.current = value;
      setShown(value);
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
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
