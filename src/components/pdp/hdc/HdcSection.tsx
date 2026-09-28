"use client";

import { useState } from "react";

/**
 * One section of the product page (pdp.html `.sec`). On desktop it is a
 * heading and its content, always open; on phones the heading becomes an
 * accordion row (the phone frame's `.acc`) and the content folds.
 *
 * The folding is CSS inside a phone media query, so the desktop render and
 * the server HTML are the same and nothing shifts on hydration.
 */
export function HdcSection({
  id,
  title,
  defaultOpen = false,
  className,
  children,
}: {
  id: string;
  title: string;
  /** Open on phones at first load. Desktop is always open. */
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const body = `${id}-body`;

  return (
    <section id={id} className={`hdc-pdp-sec${open ? "" : " is-closed"}${className ? ` ${className}` : ""}`}>
      <h2 className="hdc-disp hdc-pdp-h2">{title}</h2>
      <button
        type="button"
        className="hdc-pdp-acc"
        aria-expanded={open}
        aria-controls={body}
        onClick={() => setOpen((o) => !o)}
      >
        {title}
      </button>
      <div id={body} className="hdc-pdp-sec-body">
        {children}
      </div>
    </section>
  );
}
