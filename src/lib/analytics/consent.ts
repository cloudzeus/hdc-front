/**
 * The visitor's answer to the cookie banner, kept in localStorage.
 *
 * The key was the Kolleris eshop's (`kolleris-consent-v1`); it is now the
 * shop's own. An answer stored under the old key is carried over once — moved,
 * not asked again. Client-safe: no imports.
 */
export const CONSENT_STORAGE_KEY = "hdc-consent-v1";
export const LEGACY_CONSENT_KEY = "kolleris-consent-v1";

export type ConsentAnswer = "granted" | "denied";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

const valid = (v: string | null): v is ConsentAnswer => v === "granted" || v === "denied";

/** The stored answer, migrating it from the old key when found there. */
export function readConsent(storage: Storage): ConsentAnswer | null {
  const current = storage.getItem(CONSENT_STORAGE_KEY);
  if (valid(current)) return current;
  const legacy = storage.getItem(LEGACY_CONSENT_KEY);
  if (!valid(legacy)) return null;
  storage.setItem(CONSENT_STORAGE_KEY, legacy);
  storage.removeItem(LEGACY_CONSENT_KEY);
  return legacy;
}

/**
 * The same read, as a JavaScript expression for the inline consent-default
 * script that runs before any bundle loads: `true` when analytics is granted.
 */
export const GRANTED_EXPRESSION =
  `(localStorage.getItem(${JSON.stringify(CONSENT_STORAGE_KEY)}) || ` +
  `localStorage.getItem(${JSON.stringify(LEGACY_CONSENT_KEY)})) === "granted"`;
