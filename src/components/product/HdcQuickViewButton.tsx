"use client";

import { useQuickView } from "@/components/product/QuickViewProvider";

/**
 * The 👁 button on the HDC card (plp.html `.qv`): opens the page's quick-view
 * modal. A client leaf with one string prop; the label arrives translated.
 */
export function HdcQuickViewButton({ slug, label }: { slug: string; label: string }) {
  const quickView = useQuickView();
  return (
    <button
      type="button"
      className="hdc-card-qv"
      aria-label={label}
      title={label}
      onClick={() => quickView.open(slug)}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="2.6" />
      </svg>
    </button>
  );
}
