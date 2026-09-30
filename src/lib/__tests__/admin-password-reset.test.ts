import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MINUTES,
  RESET_TTL_MINUTES,
  allowedResetOrigins,
  generateResetToken,
  hashResetToken,
  isResetRateLimited,
  isWellFormedResetToken,
  rateLimitWindowStart,
  resetExpiresAt,
  resetLinkOrigin,
  resetTokenState,
} from "@/lib/admin/password-reset-core";

const NOW = new Date("2026-09-30T12:00:00Z");

describe("generateResetToken", () => {
  it("returns 32 random bytes as base64url and the SHA-256 of that string", () => {
    const { token, tokenHash } = generateResetToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
  });

  it("never returns the same token twice", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateResetToken().token));
    expect(seen.size).toBe(50);
  });
});

describe("hashResetToken", () => {
  it("is a stable 64-char hex digest that differs from the token", () => {
    const { token } = generateResetToken();
    const h = hashResetToken(token);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashResetToken(token)).toBe(h);
    expect(h).not.toContain(token);
  });
});

describe("isWellFormedResetToken", () => {
  it("accepts a generated token", () => {
    expect(isWellFormedResetToken(generateResetToken().token)).toBe(true);
  });

  it.each(["", "abc", "x".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)}/`])(
    "rejects %j",
    (value) => {
      expect(isWellFormedResetToken(value)).toBe(false);
    },
  );
});

describe("resetExpiresAt", () => {
  it("is 30 minutes after now", () => {
    expect(RESET_TTL_MINUTES).toBe(30);
    expect(resetExpiresAt(NOW).toISOString()).toBe("2026-09-30T12:30:00.000Z");
  });
});

describe("resetTokenState", () => {
  const future = new Date(NOW.getTime() + 60_000);
  const past = new Date(NOW.getTime() - 1);

  it("is missing when there is no row", () => {
    expect(resetTokenState(null, NOW)).toBe("missing");
  });

  it("is valid when unused and not yet expired", () => {
    expect(resetTokenState({ expiresAt: future, usedAt: null }, NOW)).toBe("valid");
  });

  it("is expired once expiresAt has passed", () => {
    expect(resetTokenState({ expiresAt: past, usedAt: null }, NOW)).toBe("expired");
  });

  it("is expired at exactly expiresAt", () => {
    expect(resetTokenState({ expiresAt: NOW, usedAt: null }, NOW)).toBe("expired");
  });

  it("is used when usedAt is set, even if not expired", () => {
    expect(resetTokenState({ expiresAt: future, usedAt: past }, NOW)).toBe("used");
  });
});

describe("rate limit", () => {
  it("windows are 15 minutes with at most 3 requests", () => {
    expect(RATE_LIMIT_WINDOW_MINUTES).toBe(15);
    expect(RATE_LIMIT_MAX).toBe(3);
    expect(rateLimitWindowStart(NOW).toISOString()).toBe("2026-09-30T11:45:00.000Z");
  });

  it("allows while both counts are under the limit", () => {
    expect(isResetRateLimited({ byEmail: 0, byIp: 0 })).toBe(false);
    expect(isResetRateLimited({ byEmail: 2, byIp: 2 })).toBe(false);
  });

  it("blocks when the email has reached the limit", () => {
    expect(isResetRateLimited({ byEmail: 3, byIp: 0 })).toBe(true);
  });

  it("blocks when the IP has reached the limit", () => {
    expect(isResetRateLimited({ byEmail: 0, byIp: 3 })).toBe(true);
  });

  it("does not count an unknown IP against anybody", () => {
    expect(isResetRateLimited({ byEmail: 1, byIp: null })).toBe(false);
  });
});

describe("allowedResetOrigins", () => {
  it("contains the configured site origin", () => {
    expect(
      allowedResetOrigins({ siteOrigin: "https://kolleris.com", siteConfigured: true, isDev: false }),
    ).toEqual(["https://kolleris.com"]);
  });

  it("ignores an unconfigured (defaulted) site origin", () => {
    expect(
      allowedResetOrigins({ siteOrigin: "http://localhost:3000", siteConfigured: false, isDev: false }),
    ).toEqual([]);
  });

  it("adds localhost:3101 in development only", () => {
    expect(
      allowedResetOrigins({ siteOrigin: "https://kolleris.com", siteConfigured: true, isDev: true }),
    ).toEqual(["https://kolleris.com", "http://localhost:3101"]);
  });
});

describe("resetLinkOrigin", () => {
  const allow = ["https://kolleris.com", "http://localhost:3101"];

  it("uses the forwarded proto and host when they are on the allowlist", () => {
    expect(
      resetLinkOrigin({ forwardedProto: "https", forwardedHost: "kolleris.com", host: "10.0.0.5:3000" }, allow),
    ).toBe("https://kolleris.com");
  });

  it("uses the Host header when nothing is forwarded", () => {
    expect(resetLinkOrigin({ host: "localhost:3101" }, allow)).toBe("http://localhost:3101");
  });

  it("takes the first entry of a comma-separated forwarded chain", () => {
    expect(
      resetLinkOrigin({ forwardedProto: "https, http", forwardedHost: "kolleris.com, proxy.internal" }, allow),
    ).toBe("https://kolleris.com");
  });

  it("is case-insensitive on the host", () => {
    expect(resetLinkOrigin({ forwardedProto: "https", forwardedHost: "Kolleris.COM" }, allow)).toBe(
      "https://kolleris.com",
    );
  });

  it("falls back to the first allowlisted origin for a foreign host", () => {
    expect(resetLinkOrigin({ forwardedProto: "https", forwardedHost: "evil.example" }, allow)).toBe(
      "https://kolleris.com",
    );
  });

  it("does not accept the right host with the wrong scheme", () => {
    expect(resetLinkOrigin({ forwardedProto: "http", forwardedHost: "kolleris.com" }, allow)).toBe(
      "https://kolleris.com",
    );
  });

  it("does not accept a host that merely ends with an allowed one", () => {
    expect(resetLinkOrigin({ forwardedProto: "https", forwardedHost: "evilkolleris.com" }, allow)).toBe(
      "https://kolleris.com",
    );
  });

  it("does not accept a host smuggling a path or userinfo", () => {
    expect(
      resetLinkOrigin({ forwardedProto: "https", forwardedHost: "kolleris.com@evil.example" }, allow),
    ).toBe("https://kolleris.com");
    expect(
      resetLinkOrigin({ forwardedProto: "https", forwardedHost: "evil.example/kolleris.com" }, allow),
    ).toBe("https://kolleris.com");
  });

  it("is null when nothing is allowlisted", () => {
    expect(resetLinkOrigin({ forwardedProto: "https", forwardedHost: "kolleris.com" }, [])).toBeNull();
  });
});
