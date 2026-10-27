import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ default: () => ({ auth: (fn: unknown) => fn }) }));
vi.mock("next-intl/middleware", () => ({ default: () => () => null }));
vi.mock("@/auth.config", () => ({ authConfig: {} }));

import { adminGate, isAdminLoginPath } from "@/lib/admin/gate";

describe("isAdminLoginPath", () => {
  it("matches the sign-in page and the emergency page only", () => {
    expect(isAdminLoginPath("/admin/login")).toBe(true);
    expect(isAdminLoginPath("/admin/login/emergency")).toBe(true);
    expect(isAdminLoginPath("/admin/login/other")).toBe(false);
    expect(isAdminLoginPath("/admin/orders")).toBe(false);
    expect(isAdminLoginPath("/admin")).toBe(false);
  });
});

describe("adminGate", () => {
  it.each(["/admin/login", "/admin/login/emergency", "/admin/forgot-password", "/admin/reset-password"])(
    "lets an unauthenticated visitor reach %s",
    (path) => {
      expect(adminGate(path, false)).toEqual({ action: "next" });
    },
  );
  it.each(["/admin/login/x", "/admin/login/emergency/x", "/admin/forgot-password/x", "/admin/reset-passwordx"])(
    "keeps %s gated",
    (path) => {
      expect(adminGate(path, false)).toEqual({ action: "redirect", to: "/admin/login", redirect: path });
    },
  );
  it("lets an authenticated visitor use the recovery pages", () => {
    expect(adminGate("/admin/forgot-password", true)).toEqual({ action: "next" });
    expect(adminGate("/admin/reset-password", true)).toEqual({ action: "next" });
  });
  it("sends an unauthenticated visitor from /admin/orders to login with redirect", () => {
    expect(adminGate("/admin/orders", false)).toEqual({
      action: "redirect",
      to: "/admin/login",
      redirect: "/admin/orders",
    });
  });
  it("sends an authenticated visitor on the emergency page to /admin", () => {
    expect(adminGate("/admin/login/emergency", true)).toEqual({ action: "redirect", to: "/admin" });
    expect(adminGate("/admin/login", true)).toEqual({ action: "redirect", to: "/admin" });
  });
  it("lets an authenticated visitor into protected pages", () => {
    expect(adminGate("/admin/orders", true)).toEqual({ action: "next" });
  });
});

describe("proxy matcher", () => {
  it("does not run the admin gate on /api/admin/sso/callback", async () => {
    const { config } = await import("@/proxy");
    const gate = new RegExp(`^${config.matcher[0]}$`);
    expect(gate.test("/api/admin/sso/callback")).toBe(false);
    expect(gate.test("/api/admin/sso/start")).toBe(false);
    expect(gate.test("/admin/login/emergency")).toBe(true);
  });
});
