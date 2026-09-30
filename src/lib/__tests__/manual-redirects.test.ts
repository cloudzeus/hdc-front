import { describe, expect, it, vi } from "vitest";
import {
  createManualRedirectCache,
  createManualResolver,
  normalizeRedirectPath,
} from "@/lib/seo/manual-redirects";

describe("normalizeRedirectPath", () => {
  it("folds case, trailing slashes, doubled slashes and the query", () => {
    expect(normalizeRedirectPath("/Proion/X/")).toBe("/proion/x");
    expect(normalizeRedirectPath("proion//x?utm=1#top")).toBe("/proion/x");
    expect(normalizeRedirectPath("/")).toBe("/");
  });

  it("decodes escapes so a Greek path matches however it was typed", () => {
    expect(normalizeRedirectPath("/%CE%B4%CF%81%CE%AC%CF%80%CE%B1%CE%BD%CE%B1")).toBe("/δράπανα");
  });
});

describe("createManualResolver", () => {
  const rule = (id: string, fromPath: string, toPath: string) => ({ id, fromPath, toPath });

  it("finds a rule whatever the spelling of the request", () => {
    const resolve = createManualResolver([rule("1", "/old-page", "/katalogos/drapana")]);
    expect(resolve("/Old-Page/")).toEqual({ id: "1", to: "/katalogos/drapana" });
    expect(resolve("/other")).toBeNull();
  });

  it("follows a chain to its end, so the visitor makes one hop", () => {
    const resolve = createManualResolver([rule("1", "/a", "/b"), rule("2", "/b", "/c")]);
    expect(resolve("/a")).toEqual({ id: "1", to: "/c" });
  });

  it("drops a rule that points at itself and refuses a loop", () => {
    expect(createManualResolver([rule("1", "/a", "/A/")])("/a")).toBeNull();
    const loop = createManualResolver([rule("1", "/a", "/b"), rule("2", "/b", "/a")]);
    expect(loop("/a")).toBeNull();
  });

  it("does not follow an absolute target", () => {
    const resolve = createManualResolver([rule("1", "/a", "https://example.com/b"), rule("2", "/b", "/c")]);
    expect(resolve("/a")?.to).toBe("https://example.com/b");
  });
});

describe("createManualRedirectCache", () => {
  it("loads once, serves from memory, and refreshes in the background after the TTL", async () => {
    let clock = 0;
    const load = vi
      .fn()
      .mockResolvedValueOnce([{ id: "1", fromPath: "/a", toPath: "/b" }])
      .mockResolvedValueOnce([{ id: "2", fromPath: "/a", toPath: "/c" }]);
    const get = createManualRedirectCache({ load, ttlMs: 60_000, now: () => clock });

    expect((await get())("/a")?.to).toBe("/b");
    expect((await get())("/a")?.to).toBe("/b");
    expect(load).toHaveBeenCalledTimes(1);

    clock = 61_000;
    // Stale: this request still gets the old copy, a refresh starts.
    expect((await get())("/a")?.to).toBe("/b");
    await new Promise((r) => setTimeout(r, 0));
    expect(load).toHaveBeenCalledTimes(2);
    expect((await get())("/a")?.to).toBe("/c");
  });

  it("keeps working when the database is down", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const get = createManualRedirectCache({ load: () => Promise.reject(new Error("down")) });
    expect((await get())("/a")).toBeNull();
    error.mockRestore();
  });
});

describe("createManualRedirectCache: a slow database", () => {
  it("does not wait longer than the timeout", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const get = createManualRedirectCache({ load: () => new Promise(() => {}), timeoutMs: 20 });
    const started = Date.now();
    expect((await get())("/a")).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
    error.mockRestore();
  });
});
