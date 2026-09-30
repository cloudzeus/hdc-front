"use client";

import { openConsentSettings } from "@/components/analytics/CookieConsent";

/**
 * «Ρυθμίσεις cookies»: reopens the consent panel so a visitor can change or
 * withdraw an answer. A button, not a link: it opens a panel, it goes nowhere.
 */
export function CookieSettingsButton({ label, className }: { label: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      aria-haspopup="dialog"
      onClick={(e) => openConsentSettings(e.currentTarget)}
    >
      {label}
    </button>
  );
}
