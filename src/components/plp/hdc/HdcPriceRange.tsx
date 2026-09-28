"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * ΤΙΜΗ (plp.html `.range` + `.bar`): two boxes in euros with VAT and a bar with
 * two square handles over the listing's own price span.
 *
 * Dragging or typing only moves the local values; the listing reloads when a
 * handle is let go, or on Enter / leaving a box — not on every pixel. The URL
 * gets `min`/`max` in euros with VAT, the numbers the cards print.
 */
export function HdcPriceRange({
  bounds,
  current,
  baseHref,
  labels,
}: {
  /** The span of the result set, gross, whole euros. */
  bounds: { min: number; max: number };
  /** The URL's range, gross. */
  current: { min?: number; max?: number };
  /** The current URL without min, max and page. */
  baseHref: string;
  labels: { min: string; max: string };
}) {
  const router = useRouter();
  const clamp = (v: number) =>
    Math.min(bounds.max, Math.max(bounds.min, Math.round(v)));
  const [lo, setLo] = useState(clamp(current.min ?? bounds.min));
  const [hi, setHi] = useState(clamp(current.max ?? bounds.max));
  const span = Math.max(1, bounds.max - bounds.min);
  const pct = (v: number) => ((v - bounds.min) / span) * 100;

  const commit = (nextLo = lo, nextHi = hi) => {
    const a = clamp(Math.min(nextLo, nextHi));
    const b = clamp(Math.max(nextLo, nextHi));
    setLo(a);
    setHi(b);
    const url = new URL(baseHref, "http://x");
    if (a > bounds.min) url.searchParams.set("min", String(a));
    if (b < bounds.max) url.searchParams.set("max", String(b));
    const query = url.searchParams.toString();
    const href = query ? `${url.pathname}?${query}` : url.pathname;
    if (a === (current.min ?? bounds.min) && b === (current.max ?? bounds.max))
      return;
    router.push(href, { scroll: false });
  };

  const box = (
    value: number,
    set: (n: number) => void,
    label: string,
    which: "lo" | "hi",
  ) => (
    <label className="hdc-range-box">
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={bounds.min}
        max={bounds.max}
        value={value}
        onChange={(e) => set(Number(e.target.value) || 0)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        data-which={which}
      />
      <span aria-hidden>€</span>
    </label>
  );

  return (
    <div>
      <div className="hdc-range">
        {box(lo, setLo, labels.min, "lo")}
        <span aria-hidden>—</span>
        {box(hi, setHi, labels.max, "hi")}
      </div>
      <div className="hdc-bar">
        <i
          style={{
            left: `${pct(Math.min(lo, hi))}%`,
            right: `${100 - pct(Math.max(lo, hi))}%`,
          }}
        />
        <input
          type="range"
          aria-label={labels.min}
          min={bounds.min}
          max={bounds.max}
          value={lo}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi))}
          onPointerUp={() => commit()}
          onKeyUp={() => commit()}
        />
        <input
          type="range"
          aria-label={labels.max}
          min={bounds.min}
          max={bounds.max}
          value={hi}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo))}
          onPointerUp={() => commit()}
          onKeyUp={() => commit()}
        />
      </div>
    </div>
  );
}
