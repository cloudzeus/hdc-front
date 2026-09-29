"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";
import {
  MENU_PLATFORMS,
  platformName,
  type Counts,
  type MenuPlatform,
} from "@/lib/catalog/mega-menu-core";
import { radioStep } from "./keys";

/**
 * The battery switch (mockup `.batbar .bats`, and the phone frames' `.pb`),
 * one component for both: a radiogroup of the four platforms.
 *
 * One Tab stop — the checked battery — and the arrows move the choice round
 * the four (Home / End to the ends), as a radiogroup does. A choice is instant
 * and harmless (it only re-counts the menu), so the selection follows focus.
 *
 *  - `bats`: the desktop batteries, with the fill (the platform's share of
 *    the catalogue), the count and the terminal nub;
 *  - `chips`: the phone's four chips.
 */
export function PlatformSwitch({
  plat,
  onPlat,
  variant,
  totals,
  fills,
  format,
}: {
  plat: MenuPlatform;
  onPlat: (p: MenuPlatform) => void;
  variant: "bats" | "chips";
  totals?: Counts;
  /** Percent per platform; the batteries fill from empty once shown. */
  fills?: Counts;
  format?: (n: number) => string;
}) {
  const t = useTranslations("chrome.MegaMenu");
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const onKey = (e: React.KeyboardEvent, index: number) => {
    const next = radioStep(e.key, index, MENU_PLATFORMS.length);
    if (next == null) return;
    e.preventDefault();
    // The document's ↑↓ walk the roots; inside the switch they are its own.
    e.stopPropagation();
    onPlat(MENU_PLATFORMS[next]);
    buttons.current[next]?.focus();
  };

  const radio = (
    p: MenuPlatform,
    index: number,
    className: string | undefined,
    children: React.ReactNode,
  ) => (
    <button
      key={p}
      ref={(el) => {
        buttons.current[index] = el;
      }}
      type="button"
      role="radio"
      aria-checked={p === plat}
      tabIndex={p === plat ? 0 : -1}
      className={className}
      onClick={() => onPlat(p)}
      onKeyDown={(e) => onKey(e, index)}
    >
      {children}
    </button>
  );

  if (variant === "chips") {
    return (
      <div className="hdc-mm-pb" role="radiogroup" aria-label={t("diakoptis")}>
        {MENU_PLATFORMS.map((p, i) =>
          radio(p, i, p === plat ? "is-on" : undefined, platformName(p, t("oles"))),
        )}
      </div>
    );
  }

  return (
    <div className="hdc-mm-bats" role="radiogroup" aria-label={t("diakoptis")}>
      {MENU_PLATFORMS.map((p, i) => (
        <div key={p} className={`hdc-mm-batwrap${p === plat ? " is-on" : ""}`}>
          {radio(
            p,
            i,
            `hdc-mm-bat${p === plat ? " is-on" : ""}`,
            <>
              <span className="fill" style={{ width: `${fills?.[p] ?? 0}%` }} aria-hidden />
              <b>{platformName(p, t("oles"))}</b>
              {totals && format && <span className="n">{format(totals[p])}</span>}
            </>,
          )}
        </div>
      ))}
    </div>
  );
}
