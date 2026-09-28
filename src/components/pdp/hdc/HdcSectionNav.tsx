"use client";

import { useEffect, useState } from "react";
import { AddToCartButton } from "@/components/cart/AddToCartButton";

/**
 * The black section bar (pdp.html `.secnav`): sticks under the header, lights
 * up the section being read, and — once the price box's «ΣΤΟ ΚΑΛΑΘΙ» has
 * scrolled out of sight — shows the price and a small button of its own.
 *
 * Desktop only; phones get the fixed bottom bar and accordions instead.
 */
export function HdcSectionNav({
  sections,
  price,
  productId,
  disabled,
  label,
  addLabel,
}: {
  sections: Array<{ id: string; label: string }>;
  price: string;
  productId: string;
  disabled: boolean;
  label: string;
  addLabel: string;
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const [mini, setMini] = useState(false);

  /*
   * The section under a reading line 40% down the screen. The observer's root
   * is shrunk to that line, so exactly one section intersects it at a time;
   * in the gap between two, the last one stays lit.
   */
  useEffect(() => {
    const nodes = sections
      .map((s) => document.getElementById(s.id))
      .filter((n): n is HTMLElement => n != null);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((entry) => entry.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-40% 0px -59% 0px" },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections]);

  /* The main CTA out of view (above the fold line) → the mini price. */
  useEffect(() => {
    const cta = document.getElementById("hdc-pdp-cta");
    if (!cta) return;
    const observer = new IntersectionObserver(
      ([entry]) => setMini(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { rootMargin: "-120px 0px 0px 0px" },
    );
    observer.observe(cta);
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="hdc-pdp-secnav" aria-label={label}>
      <div className="hdc-wrap">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={s.id === active ? "on" : undefined}
            aria-current={s.id === active ? "true" : undefined}
            onClick={() => setActive(s.id)}
          >
            {s.label}
          </a>
        ))}
        <div className={`hdc-pdp-mini${mini ? " on" : ""}`} aria-hidden={!mini}>
          <b>{price}</b>
          <AddToCartButton
            productId={productId}
            disabled={disabled}
            label={addLabel}
            className="hdc-pdp-mini-add"
          />
        </div>
      </div>
    </nav>
  );
}
