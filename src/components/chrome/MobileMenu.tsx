"use client";

import { Menu, User, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { LocaleSwitch } from "@/components/chrome/LocaleSwitch";
import { useMegaMenuData, usePlatformChoice } from "@/components/chrome/MegaMenu/data";
import { MobileMegaScreens, MobileMegaSwitch } from "@/components/chrome/MegaMenu/MobileMega";
import {
  MobileMegaSkeleton,
  MobileMegaSkeletonSwitch,
} from "@/components/chrome/MegaMenu/MegaStates";
import { Link, usePathname } from "@/i18n/navigation";
import type { MenuCategory } from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";
import { isHdcNavActive } from "@/lib/hdc-nav";

/*
 * `prefetch={false}` on every link here: the drawer is on every page and
 * nobody follows all of them, while every prefetch is a full server render
 * (the pages answer `no-store`, they read the cart and locale from cookies).
 */

/**
 * The phone drawer, owning its own menu button.
 *
 * A black panel (HDC). With the Milwaukee tree loaded it carries the mega
 * menu's phone form (megamenu.html «ΣΤΟ ΚΙΝΗΤΟ»): the battery switch pinned
 * under the top bar, the roots, and each root's own screen. The tree is
 * fetched when the drawer first opens (a skeleton of the list stands in while
 * it arrives); if HDCtool cannot be reached, the drawer shows the five header
 * destinations and the synced categories as an accordion, as before. Then the
 * other links, the language and the account. Every touch target is at least
 * 44px.
 *
 * Everything below 1024px uses this drawer, tablets included: the desktop
 * panel needs the width, and one model per width keeps touch and keyboard
 * behaviour the same. Esc steps back out of a root's screen first, then
 * closes; the focus goes back to where it came from each time.
 */
export function MobileMenu({
  categories,
  nav,
}: {
  categories: MenuCategory[];
  /** The header's five links, already resolved and translated. */
  nav: Array<{ href: string; label: string }>;
}) {
  const locale = useLocale();
  const t = useTranslations("chrome.MobileMenu");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rootId, setRootId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"in" | "back">("in");
  const opener = useRef<HTMLButtonElement | null>(null);
  /** The root whose screen was left, to take the focus back on the list. */
  const leftRoot = useRef<string | null>(null);
  const [wanted, setWanted] = useState(false);
  const { data: mega, status } = useMegaMenuData(locale, wanted);
  const [plat, choosePlat] = usePlatformChoice(open);
  const panelId = useId();
  const body = useRef<HTMLDivElement | null>(null);

  // Each screen of the drill-down starts at its top; back on the list, the
  // root that was opened is in view and holds the focus.
  useEffect(() => {
    const box = body.current;
    if (!box) return;
    const back = leftRoot.current;
    if (rootId || !back) {
      box.scrollTo({ top: 0 });
      return;
    }
    leftRoot.current = null;
    const row = box.querySelector<HTMLElement>(`[data-root="${back}"]`);
    row?.scrollIntoView({ block: "center" });
    row?.focus({ preventScroll: true });
  }, [rootId]);

  const enterRoot = (id: string | null) => {
    if (id) {
      setDirection("in");
    } else {
      leftRoot.current = rootId;
      setDirection("back");
    }
    setRootId(id);
  };

  // Lock body scroll while the drawer is open, and restore on close so the
  // page does not stay frozen if the drawer unmounts mid-transition.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        // A modal dialog: Tab goes round inside the drawer, not behind it.
        const dialog = document.getElementById(panelId);
        const stops = [
          ...(dialog?.querySelectorAll<HTMLElement>(
            'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"])',
          ) ?? []),
        ].filter((el) => el.offsetParent !== null);
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.key !== "Escape") return;
      if (rootId) {
        // One level at a time: out of the root's screen first.
        leftRoot.current = rootId;
        setDirection("back");
        setRootId(null);
        return;
      }
      setOpen(false);
      opener.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, rootId, panelId]);

  const close = () => {
    setOpen(false);
    setRootId(null);
    setDirection("in");
  };
  /** Closed without going anywhere: the focus returns to the ☰ button. */
  const dismiss = () => {
    close();
    opener.current?.focus();
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        className="hdc-act"
        aria-label={t("menoy")}
        aria-expanded={open}
        aria-controls={panelId}
        onPointerDown={() => setWanted(true)}
        onClick={() => {
          setWanted(true);
          setOpen(true);
        }}
      >
        <Menu aria-hidden strokeWidth={2.2} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t("kleisimo_menoy")}
            tabIndex={-1}
            onClick={dismiss}
            className="absolute inset-0 bg-black/60"
          />

          <div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label={t("ploigisi")}
            className="hdc-mmenu"
          >
            <div className="hdc-mmenu-top">
              <span>{upGreek(t("menoy"))}</span>
              <button
                type="button"
                onClick={dismiss}
                aria-label={t("kleisimo")}
                className="hdc-mmenu-close"
                autoFocus
              >
                <X aria-hidden size={24} />
              </button>
            </div>

            {mega ? (
              <MobileMegaSwitch plat={plat} onPlat={choosePlat} />
            ) : (
              status === "loading" && <MobileMegaSkeletonSwitch />
            )}

            <div className="hdc-mmenu-body" ref={body}>
              {mega ? (
                <nav aria-label={t("ploigisi")}>
                  <MobileMegaScreens
                    data={mega}
                    plat={plat}
                    rootId={rootId}
                    onRoot={enterRoot}
                    direction={direction}
                    onNavigate={close}
                    allLabel={upGreek(t("katigories"))}
                  />
                </nav>
              ) : status === "loading" ? (
                <MobileMegaSkeleton />
              ) : (
                <>
                  <nav aria-label={t("ploigisi")} className="hdc-mmenu-main">
                    {nav.map((item) => (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={close}
                        aria-current={isHdcNavActive(item.href, pathname) ? "page" : undefined}
                        prefetch={false}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </nav>

                  {categories.length > 0 && (
                    <>
                      <p className="hdc-mmenu-label">{upGreek(t("katigories"))}</p>
                      {categories.map((category) => {
                        const isOpen = expanded === category.id;
                        return (
                          <div key={category.id} className="hdc-mmenu-cat">
                            <div className="hdc-mmenu-cat-row">
                              <Link
                                href={`/katalogos/${category.slug}`}
                                onClick={close}
                                prefetch={false}
                              >
                                <span>{upGreek(category.name)}</span>
                                <span className="hdc-mmenu-count">
                                  {category.productCount.toLocaleString(locale)}
                                </span>
                              </Link>

                              {category.children.length > 0 && (
                                <button
                                  type="button"
                                  className="hdc-mmenu-toggle"
                                  aria-expanded={isOpen}
                                  aria-label={t(
                                    isOpen ? "hide_subcategories" : "show_subcategories",
                                    { name: category.name },
                                  )}
                                  onClick={() => setExpanded(isOpen ? null : category.id)}
                                >
                                  <span aria-hidden>›</span>
                                </button>
                              )}
                            </div>

                            {isOpen && (
                              <div className="hdc-mmenu-subs">
                                {category.children.map((child) => (
                                  <Link
                                    key={child.id}
                                    href={`/katalogos/${category.slug}?sub=${child.slug}`}
                                    onClick={close}
                                    prefetch={false}
                                  >
                                    <span className="min-w-0 flex-1">{child.name}</span>
                                    <span className="hdc-mmenu-count">
                                      {child.productCount.toLocaleString(locale)}
                                    </span>
                                  </Link>
                                ))}
                                <Link
                                  href={`/katalogos/${category.slug}`}
                                  onClick={close}
                                  className="hdc-mmenu-all"
                                  prefetch={false}
                                >
                                  {upGreek(
                                    t("oles_oi_ypokatigories", {
                                      childCount: category.childCount,
                                    }),
                                  )}{" "}
                                  →
                                </Link>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              )}

              {!(mega && rootId) && (
                <div className="hdc-mmenu-links">
                  {mega && (
                    <Link href="/prosfores" onClick={close} prefetch={false}>
                      {upGreek(t("nav_offers"))}
                    </Link>
                  )}
                  <Link href="/nees-afixeis" onClick={close} prefetch={false}>
                    {upGreek(t("nees_afixeis"))}
                  </Link>
                  <Link href="/logariasmos/agapimena" onClick={close} prefetch={false}>
                    {upGreek(t("agapimena"))}
                  </Link>
                  <Link href="/epikoinonia" onClick={close} prefetch={false}>
                    {upGreek(t("epikoinonia"))}
                  </Link>
                </div>
              )}
            </div>

            {/* A click anywhere in the switcher is a navigation: close first. */}
            <div className="hdc-mmenu-foot" onClickCapture={close}>
              <LocaleSwitch />
              <Link href="/logariasmos" className="hdc-mmenu-account" prefetch={false}>
                <User aria-hidden size={18} strokeWidth={2.4} />
                {upGreek(t("logariasmos"))}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
