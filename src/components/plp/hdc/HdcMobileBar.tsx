"use client";

import { useEffect, useState } from "react";

/**
 * Phones and tablets (plp.html phone frames): the sticky bottom bar —
 * «ΦΙΛΤΡΑ (n)» black, «ΤΑΞΙΝΟΜΗΣΗ» white — and the filter sheet that rises
 * from the bottom.
 *
 * A client SHELL: it owns the open flag and the scroll lock, nothing else. The
 * filter groups are server-rendered and arrive as `children`. Each tick in the
 * sheet is a link, so the page re-renders on the server with new counts while
 * this component — and the open sheet — stays mounted; the red button then
 * reads the new total and closes the sheet onto the updated grid.
 */
export function HdcMobileBar({
  filtersLabel,
  sort,
  title,
  closeLabel,
  applyLabel,
  children,
}: {
  filtersLabel: string;
  sort: React.ReactNode;
  title: string;
  closeLabel: string;
  applyLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="hdc-mbar">
        <button
          type="button"
          className="hdc-mbar-filters"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          {filtersLabel}
        </button>
        {sort}
      </div>

      {open && (
        <div className="hdc-sheet">
          <button
            type="button"
            className="hdc-sheet-scrim"
            aria-label={closeLabel}
            tabIndex={-1}
            onClick={() => setOpen(false)}
          />
          <div
            className="hdc-sheet-panel"
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="hdc-sheet-top">
              {title}
              <button
                type="button"
                aria-label={closeLabel}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="hdc-sheet-body">{children}</div>
            <button
              type="button"
              className="hdc-sheet-apply"
              onClick={() => setOpen(false)}
            >
              {applyLabel}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
