"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/**
 * The phone header (mockup `.phone .ph`): red 56px bar, the lockup on its black
 * plinth, and ⚲ ♡ 🛒 on the right — plus the menu button, which the mockup
 * leaves implicit.
 *
 * The only state here is whether the search row is open. Everything inside
 * (logo, favourites link, mini-cart, drawer, search field) is rendered by the
 * server and passed in as slots, so this island owns one boolean and nothing
 * else.
 */
export function MobileHeader({
  home,
  actions,
  search,
  searchLabel,
  closeLabel,
}: {
  home: React.ReactNode;
  actions: React.ReactNode;
  search: React.ReactNode;
  searchLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panel = useRef<HTMLDivElement | null>(null);

  // Opening the row means "I want to type": put the caret in the field.
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
  }, [open]);

  return (
    <div className="lg:hidden">
      <div className="hdc-mhdr">
        {home}
        <div className="hdc-mhdr-icons">
          <button
            type="button"
            className="hdc-act"
            aria-label={searchLabel}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            <Search aria-hidden strokeWidth={2.2} />
          </button>
          {actions}
        </div>
      </div>

      <div ref={panel} id={panelId} hidden={!open} className="hdc-msearch">
        {search}
        <button
          type="button"
          className="hdc-msearch-close"
          aria-label={closeLabel}
          onClick={() => setOpen(false)}
        >
          <X aria-hidden size={22} />
        </button>
      </div>
    </div>
  );
}
