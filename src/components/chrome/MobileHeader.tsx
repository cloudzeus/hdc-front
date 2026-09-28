"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SearchSuggest } from "@/components/chrome/SearchSuggest";

/**
 * The phone header (mockup `.phone .ph`): red 56px bar, the lockup on its black
 * plinth, and ⚲ ♡ 🛒 on the right — plus the menu button, which the mockup
 * leaves implicit.
 *
 * ⚲ opens search FULL-SCREEN (search.html, «ΣΤΟ ΚΙΝΗΤΟ»): a red bar with the
 * field and ΑΚΥΡΟ over the whole viewport, the page underneath locked so the
 * phone's own scroll cannot drag it. The panel is mounted only while open, so
 * each search starts clean and the popular list is fetched on first use.
 */
export function MobileHeader({
  home,
  actions,
  searchLabel,
  locale,
  packoutHref,
}: {
  home: React.ReactNode;
  actions: React.ReactNode;
  searchLabel: string;
  locale: string;
  packoutHref: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);

  // Body scroll locked while the panel covers the page; restored exactly.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const before = { html: html.style.overflow, body: document.body.style.overflow };
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = before.html;
      document.body.style.overflow = before.body;
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div className="lg:hidden">
      <div className="hdc-mhdr">
        {home}
        <div className="hdc-mhdr-icons">
          <button
            ref={trigger}
            type="button"
            className="hdc-act"
            aria-label={searchLabel}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            <Search aria-hidden strokeWidth={2.2} />
          </button>
          {actions}
        </div>
      </div>

      {open && (
        <SearchSuggest locale={locale} variant="mobile" packoutHref={packoutHref} onClose={close} />
      )}
    </div>
  );
}
