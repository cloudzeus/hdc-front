/**
 * The visitor's answer to the cookie banner, kept in localStorage, and what it
 * means for Google Consent Mode v2.
 *
 * ── Two optional categories ────────────────────────────────────────────────
 *
 *   statistics  → analytics_storage                          (Google Analytics)
 *   advertising → ad_storage, ad_user_data, ad_personalization (Google Ads)
 *
 * The necessary ones (functionality_storage, security_storage) are always on.
 *
 * ── Storage ────────────────────────────────────────────────────────────────
 *
 * `hdc-consent-v2` holds `{ analytics, ads, v: 2, at }`, `at` being when the
 * visitor answered. An answer older than twelve months is no answer: the
 * banner asks again.
 *
 * The one-question banner stored "granted" | "denied" under `hdc-consent-v1`,
 * and before it under the Kolleris eshop's `kolleris-consent-v1`. Either is
 * carried over once: "granted" meant statistics only (advertising was never
 * asked), so it becomes `{ analytics: true, ads: false }`.
 *
 * Client-safe: no imports.
 */
export const CONSENT_STORAGE_KEY = "hdc-consent-v2";
export const V1_CONSENT_KEY = "hdc-consent-v1";
export const LEGACY_CONSENT_KEY = "kolleris-consent-v1";

/** Twelve months, then the banner asks again. */
export const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/** Opens the settings panel (the footer's «Ρυθμίσεις cookies»). */
export const OPEN_CONSENT_EVENT = "hdc:cookie-settings";
/** Fired after an answer is stored, so every reader re-reads it. */
export const CONSENT_CHANGE_EVENT = "hdc:consent-change";

export type ConsentChoice = { analytics: boolean; ads: boolean };
export type StoredConsent = ConsentChoice & { v: 2; at: string };

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

/** A stored v2 answer, or null when missing, malformed or expired. */
export function parseStoredConsent(raw: string | null, now: Date = new Date()): StoredConsent | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.v !== 2 || typeof v.analytics !== "boolean" || typeof v.ads !== "boolean") return null;
  if (typeof v.at !== "string") return null;
  const at = Date.parse(v.at);
  if (Number.isNaN(at)) return null;
  if (now.getTime() - at >= CONSENT_MAX_AGE_MS) return null;
  return { analytics: v.analytics, ads: v.ads, v: 2, at: v.at };
}

function stamp(choice: ConsentChoice, now: Date): StoredConsent {
  return { analytics: choice.analytics, ads: choice.ads, v: 2, at: now.toISOString() };
}

/**
 * The stored answer, migrating a v1 (or Kolleris) one when that is all there
 * is. Null means: ask.
 */
export function readConsent(storage: Storage, now: Date = new Date()): StoredConsent | null {
  const raw = storage.getItem(CONSENT_STORAGE_KEY);
  // A v2 entry, even an expired one, is the latest answer: never fall back past it.
  if (raw !== null) return parseStoredConsent(raw, now);

  for (const key of [V1_CONSENT_KEY, LEGACY_CONSENT_KEY]) {
    const old = storage.getItem(key);
    if (old !== "granted" && old !== "denied") continue;
    const migrated = stamp({ analytics: old === "granted", ads: false }, now);
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(migrated));
    storage.removeItem(V1_CONSENT_KEY);
    storage.removeItem(LEGACY_CONSENT_KEY);
    return migrated;
  }
  return null;
}

/** Stores an answer, dated now, and clears the old keys. */
export function writeConsent(storage: Storage, choice: ConsentChoice, now: Date = new Date()): StoredConsent {
  const stored = stamp(choice, now);
  storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
  storage.removeItem(V1_CONSENT_KEY);
  storage.removeItem(LEGACY_CONSENT_KEY);
  return stored;
}

type Signal = "granted" | "denied";
const signal = (on: boolean): Signal => (on ? "granted" : "denied");

/** The four Consent Mode signals the visitor decides. */
export function consentSignals(choice: ConsentChoice): {
  analytics_storage: Signal;
  ad_storage: Signal;
  ad_user_data: Signal;
  ad_personalization: Signal;
} {
  return {
    analytics_storage: signal(choice.analytics),
    ad_storage: signal(choice.ads),
    ad_user_data: signal(choice.ads),
    ad_personalization: signal(choice.ads),
  };
}

type GtagWindow = {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

/**
 * Tells Google (gtag and Tag Manager) about a new answer:
 *   gtag('consent', 'update', { the four signals })
 *   gtag('set', 'ads_data_redaction', !ads)
 *   dataLayer.push({ event: 'consent_update', analytics, ads })
 *
 * Without the inline gtag (development, or no tag configured) the calls go
 * straight into `dataLayer`, exactly as gtag itself would put them.
 */
export function applyConsent(w: GtagWindow, choice: ConsentChoice): void {
  const dataLayer = (w.dataLayer = w.dataLayer || []);
  const gtag: (...args: unknown[]) => void =
    w.gtag ??
    function () {
      // gtag queues the `arguments` object itself, not an array; the same here.
      // eslint-disable-next-line prefer-rest-params
      dataLayer.push(arguments);
    };
  gtag("consent", "update", consentSignals(choice));
  gtag("set", "ads_data_redaction", !choice.ads);
  dataLayer.push({ event: "consent_update", analytics: choice.analytics, ads: choice.ads });
}

/**
 * The inline script that runs before gtag.js and Tag Manager on every page:
 * defines `gtag`, reads the stored answer and sets the consent DEFAULT from
 * it. The same rules as `readConsent` (tested against it), in ES5, in a
 * try/catch: blocked storage or a bad value means everything denied.
 *
 * It never writes: the banner migrates a v1 answer on its first read.
 */
export const CONSENT_DEFAULT_SCRIPT = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
(function(){
  var c = { analytics: false, ads: false };
  try {
    var raw = localStorage.getItem(${JSON.stringify(CONSENT_STORAGE_KEY)});
    if (raw !== null) {
      var s = JSON.parse(raw);
      var at = s && typeof s.at === "string" ? Date.parse(s.at) : NaN;
      if (s && s.v === 2 && typeof s.analytics === "boolean" && typeof s.ads === "boolean" &&
          !isNaN(at) && Date.now() - at < ${CONSENT_MAX_AGE_MS}) {
        c.analytics = s.analytics;
        c.ads = s.ads;
      }
    } else {
      var old = localStorage.getItem(${JSON.stringify(V1_CONSENT_KEY)});
      if (old !== "granted" && old !== "denied") old = localStorage.getItem(${JSON.stringify(LEGACY_CONSENT_KEY)});
      c.analytics = old === "granted";
    }
  } catch (e) {}
  gtag('consent', 'default', {
    ad_storage: c.ads ? 'granted' : 'denied',
    ad_user_data: c.ads ? 'granted' : 'denied',
    ad_personalization: c.ads ? 'granted' : 'denied',
    analytics_storage: c.analytics ? 'granted' : 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500
  });
  gtag('set', 'ads_data_redaction', !c.ads);
})();`;
