import { describe, expect, it } from "vitest";
import { CONSENT_STORAGE_KEY, LEGACY_CONSENT_KEY, readConsent } from "@/lib/analytics/consent";

/**
 * The visitor's cookie answer, kept in localStorage. The key was the Kolleris
 * one; it is now the shop's own, and an answer stored under the old key is
 * carried over once rather than asked again.
 */
function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("readConsent", () => {
  it("uses the shop's own key", () => {
    expect(CONSENT_STORAGE_KEY).toBe("hdc-consent-v1");
    expect(readConsent(memory({ "hdc-consent-v1": "granted" }))).toBe("granted");
  });

  it("carries an answer over from the old key, once", () => {
    const storage = memory({ [LEGACY_CONSENT_KEY]: "denied" });
    expect(readConsent(storage)).toBe("denied");
    expect(storage.data.get("hdc-consent-v1")).toBe("denied");
    expect(storage.data.has(LEGACY_CONSENT_KEY)).toBe(false);
  });

  it("has no answer when neither key is set", () => {
    expect(readConsent(memory())).toBeNull();
  });

  it("ignores anything but granted or denied", () => {
    expect(readConsent(memory({ "hdc-consent-v1": "maybe" }))).toBeNull();
  });
});
