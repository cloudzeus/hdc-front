"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  applyConsent,
  CONSENT_CHANGE_EVENT,
  CONSENT_STORAGE_KEY,
  OPEN_CONSENT_EVENT,
  readConsent,
  writeConsent,
  type ConsentChoice,
} from "@/lib/analytics/consent";

/**
 * Το banner συγκατάθεσης, με δύο προαιρετικές κατηγορίες: στατιστικά (Google
 * Analytics) και διαφήμιση (Google Ads). Τα απαραίτητα είναι πάντα ενεργά.
 *
 * ── Εμφανίζεται μόνο σε όποιον δεν έχει απαντήσει ─────────────────────────
 *
 * Η απάντηση κρατιέται στον browser, όχι σε cookie: το ίδιο το banner δεν
 * πρέπει να γράψει cookie για να πει ότι δεν θέλουμε cookies. Ισχύει δώδεκα
 * μήνες και μετά ξαναρωτάμε. Αν το `localStorage` είναι κλειδωμένο —ιδιωτικό
 * παράθυρο, αυστηρές ρυθμίσεις— το banner ξαναεμφανίζεται στην επόμενη
 * σελίδα, που είναι το σωστό: χωρίς μνήμη δεν υπάρχει αποδεδειγμένη
 * συγκατάθεση.
 *
 * ── Οι τρεις επιλογές έχουν ίδιο βάρος ────────────────────────────────────
 *
 * «Αποδοχή όλων», «Μόνο απαραίτητα» και «Ρυθμίσεις» είναι ίδια κουμπιά. Η
 * άρνηση δεν κρύβεται πίσω από τις ρυθμίσεις ούτε γράφεται πιο αχνά (ΑΠΔΠΧ,
 * EDPB): ένα banner όπου το «ναι» είναι κουμπί και το «όχι» σύνδεσμος δεν
 * συλλέγει συγκατάθεση, συλλέγει κούραση.
 *
 * ── Ανάκληση ──────────────────────────────────────────────────────────────
 *
 * Το «Ρυθμίσεις cookies» του footer στέλνει `OPEN_CONSENT_EVENT` και ανοίγει
 * το ίδιο πάνελ με την τρέχουσα επιλογή. Κάθε αλλαγή στέλνει νέο update.
 *
 * Κάτω, όχι στο κέντρο: δεν είναι modal, και η σελίδα από πίσω μένει
 * διαθέσιμη.
 */

/*
 * The stored answer is read on the client only (the server cannot know it):
 * `useSyncExternalStore` with a server snapshot that renders nothing on the
 * server and during hydration. The snapshot is the stored JSON string, so it
 * is stable between reads.
 */
const SERVER = "server";
function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CONSENT_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  };
}
function snapshot(): string {
  try {
    // Also carries a v1 (or Kolleris) answer over to the v2 key, once.
    const stored = readConsent(localStorage);
    return stored ? JSON.stringify({ analytics: stored.analytics, ads: stored.ads }) : "";
  } catch {
    return "";
  }
}

type View = "banner" | "settings" | "hidden";
const NONE: ConsentChoice = { analytics: false, ads: false };

export function CookieConsent() {
  const t = useTranslations("consent");
  const raw = useSyncExternalStore(subscribe, snapshot, () => SERVER);
  const stored: ConsentChoice | null = raw && raw !== SERVER ? (JSON.parse(raw) as ConsentChoice) : null;

  /* null: follow the stored answer (banner when there is none). */
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<ConsentChoice>(NONE);
  const returnFocus = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const textId = useId();

  const shown: View = raw === SERVER ? "hidden" : (view ?? (stored ? "hidden" : "banner"));

  const openSettings = useCallback((from: HTMLElement | null) => {
    let current: ConsentChoice | null = null;
    try {
      current = readConsent(localStorage);
    } catch {
      /* no storage: start from nothing granted */
    }
    returnFocus.current = from;
    setDraft(current ? { analytics: current.analytics, ads: current.ads } : NONE);
    setView("settings");
  }, []);

  // The footer's «Ρυθμίσεις cookies», from anywhere on the page.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const from = (e as CustomEvent<{ from?: HTMLElement }>).detail?.from ?? null;
      openSettings(from ?? (document.activeElement as HTMLElement | null));
    };
    window.addEventListener(OPEN_CONSENT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, onOpen);
  }, [openSettings]);

  // Into the panel when it opens, so a keyboard user lands on the toggles.
  useEffect(() => {
    if (shown === "settings") panelRef.current?.focus();
  }, [shown]);

  function close() {
    setView(stored ? "hidden" : "banner");
    returnFocus.current?.focus();
    returnFocus.current = null;
  }

  function choose(choice: ConsentChoice) {
    try {
      writeConsent(localStorage, choice);
    } catch {
      /* Χωρίς μνήμη, η απάντηση ισχύει για αυτή τη σελίδα και ξαναρωτιέται. */
    }
    applyConsent(window as unknown as Parameters<typeof applyConsent>[0], choice);
    setView("hidden");
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
    returnFocus.current?.focus();
    returnFocus.current = null;
  }

  if (shown === "hidden") return null;

  const policyLink = (chunks: React.ReactNode) => (
    <Link href="/aporrito#cookies" prefetch={false} className="hdc-consent-link">
      {chunks}
    </Link>
  );

  if (shown === "banner") {
    return (
      <div role="dialog" aria-label={t("aria")} aria-describedby={textId} className="hdc-consent">
        <div className="hdc-consent-in">
          {/* Phones get the short first layer (purposes, providers and a link
              to the full policy), so the banner stays under a third of the
              screen; the hidden one is left out of the description. */}
          <div id={textId} className="hdc-consent-copy">
            <h2 className="hdc-consent-title hdc-semi">{t("titlos")}</h2>
            <p className="hdc-consent-text hdc-consent-long">{t.rich("keimeno", { link: policyLink })}</p>
            <p className="hdc-consent-text hdc-consent-short">{t.rich("keimeno_syntomo", { link: policyLink })}</p>
          </div>
          <div className="hdc-consent-actions">
            <button type="button" className="hdc-btn hdc-btn-ink" onClick={() => choose({ analytics: true, ads: true })}>
              {t("apodochi_olon")}
            </button>
            <button type="button" className="hdc-btn hdc-btn-ink" onClick={() => choose(NONE)}>
              {t("mono_aparaitita")}
            </button>
            <button
              type="button"
              className="hdc-btn hdc-btn-ink"
              aria-haspopup="dialog"
              onClick={(e) => openSettings(e.currentTarget)}
            >
              {t("rythmiseis")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const rows: { key: keyof ConsentChoice; label: string; text: string }[] = [
    { key: "analytics", label: t("statistika"), text: t("statistika_keimeno") },
    { key: "ads", label: t("diafimisi"), text: t("diafimisi_keimeno") },
  ];

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("rythmiseis_titlos")}
      tabIndex={-1}
      className="hdc-consent hdc-consent-panel"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="hdc-consent-in hdc-consent-in-panel">
        <div className="hdc-consent-head">
          <h2 className="hdc-consent-title hdc-semi">
            {t("rythmiseis_titlos")}
          </h2>
          <button type="button" className="hdc-consent-x" aria-label={t("kleisimo")} onClick={close}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p className="hdc-consent-text">{t.rich("rythmiseis_keimeno", { link: policyLink })}</p>

        <ul className="hdc-consent-rows">
          <li className="hdc-consent-row">
            <span className="hdc-consent-row-copy">
              <span className="hdc-consent-row-label">{t("aparaitita")}</span>
              <span className="hdc-consent-row-text">{t("aparaitita_keimeno")}</span>
            </span>
            <span className="hdc-consent-always">{t("panta_energa")}</span>
          </li>
          {rows.map((row) => (
            <li key={row.key}>
              <label className="hdc-consent-row">
                <span className="hdc-consent-row-copy">
                  <span id={`${textId}-${row.key}`} className="hdc-consent-row-label">
                    {row.label}
                  </span>
                  <span id={`${textId}-${row.key}-d`} className="hdc-consent-row-text">
                    {row.text}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-labelledby={`${textId}-${row.key}`}
                  aria-describedby={`${textId}-${row.key}-d`}
                  className="hdc-consent-switch"
                  checked={draft[row.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [row.key]: e.target.checked }))}
                />
              </label>
            </li>
          ))}
        </ul>

        <div className="hdc-consent-actions">
          <button type="button" className="hdc-btn hdc-btn-ink" onClick={() => choose(draft)}>
            {t("apothikeusi")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Asks the banner to open its settings panel (the footer link, the policy page). */
export function openConsentSettings(from?: HTMLElement | null): void {
  window.dispatchEvent(new CustomEvent(OPEN_CONSENT_EVENT, { detail: { from: from ?? null } }));
}
