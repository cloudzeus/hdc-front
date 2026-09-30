import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The proxy as a whole, on the paths the Magento step and the `.html` matcher
 * touch: old URLs answer in one hop with their query string kept, search
 * fallbacks are temporary, and a real `.html` file (a search-engine
 * verification file in public/) passes through untouched.
 *
 * Auth.js is replaced by a pass-through: what is under test is the routing,
 * not the session.
 */
vi.mock("next-auth", () => ({
  default: () => ({
    auth:
      (handler: (req: unknown) => unknown) =>
      (req: object) =>
        handler(Object.assign(req, { auth: null })),
  }),
}));

/* The manual rules come from the database in production; here, one rule. */
const recordManualHit = vi.fn();
vi.mock("@/lib/seo/manual-redirects-db", () => ({
  loadManualRules: async () => [
    { id: "r1", fromPath: "/palia-selida", toPath: "/katalogos/drapana" },
    // A person overrides an automatic Magento mapping.
    { id: "r2", fromPath: "/faqs", toPath: "/blog" },
  ],
  recordManualHit: (id: string) => recordManualHit(id),
}));

type Proxy = (req: NextRequest) => Promise<Response>;
let proxy: Proxy;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://milwaukeetoolshdc.gr");
  proxy = (await import("@/proxy")).default as unknown as Proxy;
});

const get = (path: string, host = "milwaukeetoolshdc.gr") =>
  proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }));

describe("proxy: .html files", () => {
  it("serves a verification file as is — no redirect, no rewrite, no cookie", async () => {
    const res = await get("/google1234abcdef5678.html");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("proxy: old Magento URLs", () => {
  it("sends a known product with a 301 and keeps the tracking parameters", async () => {
    const res = await get("/mpataria-18v-5-0ah-m18-b5-4932430483?utm_source=fb&gclid=abc");
    expect(res.status).toBe(301);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toMatch(/^\/proion\/.*4932430483/);
    expect(to.searchParams.get("utm_source")).toBe("fb");
    expect(to.searchParams.get("gclid")).toBe("abc");
  });

  it("sends a search fallback with a 302, not a permanent redirect", async () => {
    const res = await get("/old-tool-4933000000");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/\/anazitisi\?q=4933000000$/);
  });

  it("keeps extra parameters on an old search, without repeating the query", async () => {
    const res = await get("/catalogsearch/result?q=m18&gclid=abc");
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/anazitisi");
    expect(to.searchParams.getAll("q")).toEqual(["m18"]);
    expect(to.searchParams.get("gclid")).toBe("abc");
  });

  it("answers an old URL on www in one hop, straight to the canonical host", async () => {
    const res = await get("/terms-and-conditions", "www.milwaukeetoolshdc.gr");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://milwaukeetoolshdc.gr/oroi-chrisis");
  });

  it("still folds www for the new shop's own pages", async () => {
    const res = await get("/katalogos", "www.milwaukeetoolshdc.gr");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://milwaukeetoolshdc.gr/katalogos");
  });

  it("leaves the new shop's pages to the locale middleware", async () => {
    const res = await get("/katalogos");
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });
});

describe("proxy: manual redirects", () => {
  it("answers a manual rule with a 301, keeps the parameters and counts the hit", async () => {
    const res = await get("/Palia-Selida/?utm_source=x");
    expect(res.status).toBe(301);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/katalogos/drapana");
    expect(to.searchParams.get("utm_source")).toBe("x");
    await new Promise((r) => setTimeout(r, 0));
    expect(recordManualHit).toHaveBeenCalledWith("r1");
  });

  it("wins over the Magento table, and folds www in the same hop", async () => {
    const res = await get("/faqs", "www.milwaukeetoolshdc.gr");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://milwaukeetoolshdc.gr/blog");
  });
});

describe("proxy: pages that moved", () => {
  it("sends the Milwaukee brand page to the Milwaukee hub for good, keeping language and parameters", async () => {
    const res = await get("/brands/milwaukee?utm_source=x");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://milwaukeetoolshdc.gr/milwaukee?utm_source=x");
    const en = await get("/en/brands/milwaukee/");
    expect(en.headers.get("location")).toBe("https://milwaukeetoolshdc.gr/en/milwaukee");
  });
});
