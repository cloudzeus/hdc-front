import { describe, expect, it } from "vitest";
import {
  applyConsent,
  CONSENT_DEFAULT_SCRIPT,
  CONSENT_MAX_AGE_MS,
  CONSENT_STORAGE_KEY,
  consentSignals,
  LEGACY_CONSENT_KEY,
  parseStoredConsent,
  readConsent,
  V1_CONSENT_KEY,
  writeConsent,
} from "@/lib/analytics/consent";
import { analyticsEnabled } from "@/lib/analytics/enabled";

/**
 * The cookie answer (statistics and advertising), kept in localStorage under
 * `hdc-consent-v2` for twelve months, and what it sends to Google Consent
 * Mode v2. The one-question v1 answer (and the Kolleris one before it) is
 * carried over once, as statistics only.
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

const NOW = new Date("2026-09-30T12:00:00.000Z");
const v2 = (analytics: boolean, ads: boolean, at = NOW.toISOString()) =>
  JSON.stringify({ analytics, ads, v: 2, at });

describe("readConsent", () => {
  it("uses the v2 key", () => {
    expect(CONSENT_STORAGE_KEY).toBe("hdc-consent-v2");
    expect(readConsent(memory({ [CONSENT_STORAGE_KEY]: v2(true, false) }), NOW)).toEqual({
      analytics: true,
      ads: false,
      v: 2,
      at: NOW.toISOString(),
    });
  });

  it("has no answer when nothing is stored", () => {
    expect(readConsent(memory(), NOW)).toBeNull();
  });

  it("carries v1 «granted» over as statistics only, never advertising", () => {
    const storage = memory({ [V1_CONSENT_KEY]: "granted" });
    expect(readConsent(storage, NOW)).toMatchObject({ analytics: true, ads: false, v: 2 });
    expect(JSON.parse(storage.data.get(CONSENT_STORAGE_KEY)!)).toEqual({
      analytics: true,
      ads: false,
      v: 2,
      at: NOW.toISOString(),
    });
    expect(storage.data.has(V1_CONSENT_KEY)).toBe(false);
  });

  it("carries v1 «denied» over as both denied", () => {
    const storage = memory({ [V1_CONSENT_KEY]: "denied" });
    expect(readConsent(storage, NOW)).toMatchObject({ analytics: false, ads: false });
    expect(storage.data.has(V1_CONSENT_KEY)).toBe(false);
  });

  it("carries the Kolleris key over the same way", () => {
    const granted = memory({ [LEGACY_CONSENT_KEY]: "granted" });
    expect(readConsent(granted, NOW)).toMatchObject({ analytics: true, ads: false });
    expect(granted.data.has(LEGACY_CONSENT_KEY)).toBe(false);

    const denied = memory({ [LEGACY_CONSENT_KEY]: "denied" });
    expect(readConsent(denied, NOW)).toMatchObject({ analytics: false, ads: false });
  });

  it("prefers v1 over the Kolleris key and clears both", () => {
    const storage = memory({ [V1_CONSENT_KEY]: "denied", [LEGACY_CONSENT_KEY]: "granted" });
    expect(readConsent(storage, NOW)).toMatchObject({ analytics: false });
    expect(storage.data.has(V1_CONSENT_KEY)).toBe(false);
    expect(storage.data.has(LEGACY_CONSENT_KEY)).toBe(false);
  });

  it("ignores an old value that is neither granted nor denied", () => {
    expect(readConsent(memory({ [V1_CONSENT_KEY]: "maybe" }), NOW)).toBeNull();
  });

  it("asks again after twelve months", () => {
    const old = new Date(NOW.getTime() - CONSENT_MAX_AGE_MS).toISOString();
    const fresh = new Date(NOW.getTime() - CONSENT_MAX_AGE_MS + 60_000).toISOString();
    expect(readConsent(memory({ [CONSENT_STORAGE_KEY]: v2(true, true, old) }), NOW)).toBeNull();
    expect(readConsent(memory({ [CONSENT_STORAGE_KEY]: v2(true, true, fresh) }), NOW)).not.toBeNull();
  });

  it("does not fall back to a v1 answer past an expired v2 one", () => {
    const old = new Date(NOW.getTime() - CONSENT_MAX_AGE_MS - 1).toISOString();
    const storage = memory({ [CONSENT_STORAGE_KEY]: v2(true, true, old), [V1_CONSENT_KEY]: "granted" });
    expect(readConsent(storage, NOW)).toBeNull();
  });
});

describe("parseStoredConsent", () => {
  it.each([
    ["not json", "{"],
    ["a v1 string", "granted"],
    ["wrong version", JSON.stringify({ analytics: true, ads: true, v: 1, at: NOW.toISOString() })],
    ["non-boolean", JSON.stringify({ analytics: "yes", ads: false, v: 2, at: NOW.toISOString() })],
    ["missing date", JSON.stringify({ analytics: true, ads: false, v: 2 })],
    ["bad date", JSON.stringify({ analytics: true, ads: false, v: 2, at: "soon" })],
    ["null", "null"],
  ])("rejects %s", (_, raw) => {
    expect(parseStoredConsent(raw, NOW)).toBeNull();
  });
});

describe("writeConsent", () => {
  it("stores the JSON shape, dated now, and clears the old keys", () => {
    const storage = memory({ [V1_CONSENT_KEY]: "granted", [LEGACY_CONSENT_KEY]: "granted" });
    writeConsent(storage, { analytics: false, ads: true }, NOW);
    expect(JSON.parse(storage.data.get(CONSENT_STORAGE_KEY)!)).toEqual({
      analytics: false,
      ads: true,
      v: 2,
      at: NOW.toISOString(),
    });
    expect(storage.data.has(V1_CONSENT_KEY)).toBe(false);
    expect(storage.data.has(LEGACY_CONSENT_KEY)).toBe(false);
    expect(readConsent(storage, NOW)).toMatchObject({ analytics: false, ads: true });
  });
});

describe("consentSignals", () => {
  it("maps statistics to analytics_storage and advertising to the three ad signals", () => {
    expect(consentSignals({ analytics: true, ads: false })).toEqual({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    expect(consentSignals({ analytics: false, ads: true })).toEqual({
      analytics_storage: "denied",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    });
  });
});

describe("applyConsent", () => {
  it("sends the update, the redaction and the GTM event through gtag", () => {
    const calls: unknown[][] = [];
    const w = { dataLayer: [] as unknown[], gtag: (...args: unknown[]) => void calls.push(args) };
    applyConsent(w, { analytics: true, ads: false });
    expect(calls).toEqual([
      [
        "consent",
        "update",
        {
          analytics_storage: "granted",
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
        },
      ],
      ["set", "ads_data_redaction", true],
    ]);
    expect(w.dataLayer).toEqual([{ event: "consent_update", analytics: true, ads: false }]);
  });

  it("turns redaction off when advertising is accepted", () => {
    const calls: unknown[][] = [];
    applyConsent({ gtag: (...a: unknown[]) => void calls.push(a) }, { analytics: true, ads: true });
    expect(calls[1]).toEqual(["set", "ads_data_redaction", false]);
  });

  it("queues gtag-shaped entries in dataLayer when gtag is not loaded", () => {
    const w: { dataLayer?: unknown[] } = {};
    applyConsent(w, { analytics: false, ads: false });
    expect(w.dataLayer).toHaveLength(3);
    expect(Array.from(w.dataLayer![0] as ArrayLike<unknown>)).toEqual([
      "consent",
      "update",
      consentSignals({ analytics: false, ads: false }),
    ]);
    expect(Array.from(w.dataLayer![1] as ArrayLike<unknown>)).toEqual(["set", "ads_data_redaction", true]);
    expect(w.dataLayer![2]).toEqual({ event: "consent_update", analytics: false, ads: false });
  });
});

/**
 * The inline script, run as the browser would: a fake window with a
 * localStorage, then what landed in dataLayer.
 */
function runDefaultScript(storage: ReturnType<typeof memory> | "throws", now = NOW) {
  const dataLayer: unknown[] = [];
  const localStorage =
    storage === "throws"
      ? {
          getItem: () => {
            throw new Error("SecurityError");
          },
        }
      : storage;
  const window = { dataLayer } as { dataLayer: unknown[] };
  const FakeDate = class extends Date {
    static now() {
      return now.getTime();
    }
  };
  // The script uses bare `dataLayer`, as a browser global.
  new Function("window", "dataLayer", "localStorage", "Date", CONSENT_DEFAULT_SCRIPT)(
    window,
    dataLayer,
    localStorage,
    FakeDate,
  );
  const calls = dataLayer.map((entry) => Array.from(entry as ArrayLike<unknown>));
  const def = calls.find((c) => c[0] === "consent" && c[1] === "default")?.[2] as Record<string, unknown>;
  const redaction = calls.find((c) => c[0] === "set" && c[1] === "ads_data_redaction")?.[2];
  return { calls, def, redaction };
}

describe("CONSENT_DEFAULT_SCRIPT", () => {
  it("denies everything optional on a first visit, keeps the necessary ones", () => {
    const { calls, def, redaction } = runDefaultScript(memory());
    expect(calls[0]?.slice(0, 2)).toEqual(["consent", "default"]);
    expect(def).toEqual({
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      functionality_storage: "granted",
      security_storage: "granted",
      wait_for_update: 500,
    });
    expect(redaction).toBe(true);
  });

  it("denies everything when storage throws", () => {
    const { def } = runDefaultScript("throws");
    expect(def.analytics_storage).toBe("denied");
    expect(def.ad_storage).toBe("denied");
  });

  it.each([
    ["v2, all granted", { [CONSENT_STORAGE_KEY]: v2(true, true) }],
    ["v2, statistics only", { [CONSENT_STORAGE_KEY]: v2(true, false) }],
    ["v2, advertising only", { [CONSENT_STORAGE_KEY]: v2(false, true) }],
    ["v2, none", { [CONSENT_STORAGE_KEY]: v2(false, false) }],
    ["v2 expired", { [CONSENT_STORAGE_KEY]: v2(true, true, "2025-09-30T12:00:00.000Z") }],
    ["v2 malformed", { [CONSENT_STORAGE_KEY]: "{oops" }],
    ["v2 expired with a v1 behind it", { [CONSENT_STORAGE_KEY]: v2(true, true, "2024-01-01T00:00:00Z"), [V1_CONSENT_KEY]: "granted" }],
    ["v1 granted", { [V1_CONSENT_KEY]: "granted" }],
    ["v1 denied", { [V1_CONSENT_KEY]: "denied" }],
    ["Kolleris granted", { [LEGACY_CONSENT_KEY]: "granted" }],
    ["v1 junk, Kolleris granted", { [V1_CONSENT_KEY]: "x", [LEGACY_CONSENT_KEY]: "granted" }],
  ])("agrees with readConsent: %s", (_, initial) => {
    const expected = readConsent(memory(initial), NOW) ?? { analytics: false, ads: false };
    const { def, redaction } = runDefaultScript(memory(initial));
    expect(def).toMatchObject({
      ...consentSignals(expected),
      functionality_storage: "granted",
      security_storage: "granted",
    });
    expect(redaction).toBe(!expected.ads);
  });

  it("never writes to storage", () => {
    const storage = memory({ [V1_CONSENT_KEY]: "granted" });
    runDefaultScript(storage);
    expect([...storage.data.keys()]).toEqual([V1_CONSENT_KEY]);
  });
});

describe("analyticsEnabled", () => {
  it("is on only in production with a GA4 id or a GTM container", () => {
    expect(analyticsEnabled({ NODE_ENV: "development", NEXT_PUBLIC_GA_ID: "G-7S40G653WP" })).toBe(false);
    expect(analyticsEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(analyticsEnabled({ NODE_ENV: "production", NEXT_PUBLIC_GA_ID: "G-7S40G653WP" })).toBe(true);
    expect(analyticsEnabled({ NODE_ENV: "production", NEXT_PUBLIC_GTM_ID: "GTM-ABCD123" })).toBe(true);
  });
});
