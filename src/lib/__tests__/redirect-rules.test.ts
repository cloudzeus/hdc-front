import { describe, expect, it } from "vitest";
import type { ManualRule } from "@/lib/seo/manual-redirects";
import { validateRedirect } from "@/lib/seo/redirect-rules";

const base = { existing: [] as ManualRule[], moved: { "/brands/milwaukee": "/milwaukee" }, canonicalHost: "milwaukeetoolshdc.gr" };
const check = (from: string, to: string, extra: Partial<typeof base> = {}) => validateRedirect({ ...base, ...extra, from, to });

describe("validateRedirect", () => {
  it("accepts an ordinary path and stores it normalised", () => {
    expect(check("/Palia-Selida/", "/Milwaukee-M18/")).toEqual({ ok: true, from: "/palia-selida", to: "/milwaukee-m18" });
  });

  it("never lets a core path of the shop be redirected, in any language", () => {
    for (const from of ["/", "/en", "/it", "/el", "/checkout", "/checkout/epibebaiosi/1", "/kalathi", "/eisodos", "/eggrafi/x", "/logariasmos", "/api/x", "/admin", "/_next/static/x", "/en/checkout", "/it/kalathi"]) {
      expect(check(from, "/milwaukee").ok, from).toBe(false);
    }
  });

  it("allows an absolute target only on the shop's own host, stored as its path", () => {
    expect(check("/a", "https://milwaukeetoolshdc.gr/Milwaukee")).toEqual({ ok: true, from: "/a", to: "/milwaukee" });
    expect(check("/a", "https://evil.example/x").ok).toBe(false);
    expect(check("/a", "http://milwaukeetoolshdc.gr/x").ok).toBe(false);
  });

  it("refuses targets a browser reads as another site, and an /el prefix", () => {
    for (const to of ["//evil.example", "/\\evil.example", "/a\\b", "evil.example", "/el/milwaukee"]) {
      expect(check("/a", to).ok, to).toBe(false);
    }
  });

  it("refuses loops, through the moved pages too, and chains over five hops", () => {
    expect(check("/milwaukee", "/brands/milwaukee").ok).toBe(false);
    expect(check("/b", "/a", { existing: [{ id: "1", fromPath: "/a", toPath: "/b" }] }).ok).toBe(false);
    const chain = ["/c1", "/c2", "/c3", "/c4", "/c5"].map((p, i, all) => ({ id: p, fromPath: p, toPath: all[i + 1] ?? "/end" }));
    expect(check("/c0", "/c1", { existing: chain }).ok).toBe(false);
    expect(check("/c0", "/c3", { existing: chain }).ok).toBe(true);
  });
});
