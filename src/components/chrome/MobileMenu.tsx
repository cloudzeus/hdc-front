"use client";

import { Menu, User, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { LocaleSwitch } from "@/components/chrome/LocaleSwitch";
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
 * A black panel (HDC): the five header destinations first, in the header's
 * order, then the synced categories as an accordion, then the language and the
 * account. Every touch target is at least 44px.
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
  const panelId = useId();

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
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className="hdc-act"
        aria-label={t("menoy")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden strokeWidth={2.2} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t("kleisimo_menoy")}
            tabIndex={-1}
            onClick={close}
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
                onClick={close}
                aria-label={t("kleisimo")}
                className="hdc-mmenu-close"
                autoFocus
              >
                <X aria-hidden size={24} />
              </button>
            </div>

            <div className="hdc-mmenu-body">
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

              <div className="hdc-mmenu-links">
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
            </div>

            {/* A click anywhere in the switcher is a navigation: close first. */}
            <div className="hdc-mmenu-foot" onClickCapture={close}>
              <LocaleSwitch />
              <Link
                href="/logariasmos"
                className="hdc-mmenu-account"
                prefetch={false}
              >
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
