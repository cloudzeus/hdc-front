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

describe("proxy: Greek-only indexing once live", () => {
  it("marks /en and /it pages noindex, follow in the header; Greek pages get none", async () => {
    vi.stubEnv("SITE_INDEXING", "on");
    try {
      expect((await get("/en/katalogos")).headers.get("x-robots-tag")).toBe("noindex, follow");
      expect((await get("/it")).headers.get("x-robots-tag")).toBe("noindex, follow");
      expect((await get("/katalogos")).headers.get("x-robots-tag")).toBeNull();
    } finally {
      vi.unstubAllEnvs();
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://milwaukeetoolshdc.gr");
    }
  });
});

describe("proxy: listing query strings", () => {
  const location = (res: Response) => {
    const to = new URL(res.headers.get("location")!);
    return `${to.pathname}${to.search}`;
  };

  it("leaves a canonical listing to the page, attribution and router params included", async () => {
    for (const path of [
      "/katalogos/drapana",
      "/katalogos/drapana?page=3",
      "/katalogos/drapana?platform=M18&series=fuel,onekey&utm_source=x",
      "/katalogos/drapana?sub=x&_rsc=abc",
      "/anazitisi?q=m18&platform=all",
    ]) {
      const res = await get(path);
      expect(res.headers.get("location"), path).toBeNull();
      expect(res.status, path).toBe(200);
    }
  });

  it("301s a non-canonical spelling to the canonical one, on the same host", async () => {
    const res = await get("/katalogos/drapana?series=onekey,fuel&platform=m18&min=137&max=1234&foo=1");
    expect(res.status).toBe(301);
    expect(location(res)).toBe("/katalogos/drapana?series=fuel,onekey&platform=M18&min=100&max=1300");
    expect(new URL(res.headers.get("location")!).host).toBe("milwaukeetoolshdc.gr");
  });

  it("goes straight to the canonical host from www., in one hop", async () => {
    const res = await get("/katalogos/drapana?sub=b,a", "www.milwaukeetoolshdc.gr");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://milwaukeetoolshdc.gr/katalogos/drapana?sub=a,b");
  });

  it("keeps the locale prefix", async () => {
    const res = await get("/en/brands/dewalt?sort=relevance&sub=b,a");
    expect(res.status).toBe(301);
    expect(location(res)).toBe("/en/brands/dewalt?sub=a,b");
  });

  it("moves perRow into a cookie with an uncached 307", async () => {
    const res = await get("/proionta?perRow=3&sub=a");
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/proionta?sub=a");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toMatch(/^HDC_PER_ROW=3;/);
  });

  it("never refuses: an over-long search is cut and a silly page clamped, through a 301", async () => {
    const long = await get(`/anazitisi?q=${"a".repeat(300)}&platform=M18`);
    expect(long.status).toBe(301);
    expect(location(long)).toBe(`/anazitisi?q=${"a".repeat(200)}&platform=M18`);

    const deep = await get("/katalogos/drapana?page=99999");
    expect(deep.status).toBe(301);
    expect(location(deep)).toBe("/katalogos/drapana?page=60");

    const all = await get(
      "/anazitisi?q=m18&platform=M18&avail=in-stock&content=bare&series=fuel,onekey&sub=a,b,c&min=100",
    );
    expect(all.status).toBe(200);
    expect(all.headers.get("location")).toBeNull();
  });

  it("never touches a POST (Server Actions) or a non-listing page", async () => {
    const post = await proxy(
      new NextRequest("https://milwaukeetoolshdc.gr/katalogos/drapana?sub=b,a&foo=1", {
        method: "POST",
        headers: { host: "milwaukeetoolshdc.gr" },
      }),
    );
    expect(post.headers.get("location")).toBeNull();
    const pdp = await get("/proion/x?foo=1&sub=b,a");
    expect(pdp.headers.get("location")).toBeNull();
  });
});

describe("proxy: per-IP rate limit", () => {
  const from = (ip: string, path: string, method = "GET") =>
    proxy(
      new NextRequest(`https://milwaukeetoolshdc.gr${path}`, {
        method,
        headers: { host: "milwaukeetoolshdc.gr", "cf-connecting-ip": ip },
      }),
    );

  it("lets a burst of filtered views through, then answers 429 with Retry-After", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await from("203.0.113.10", "/katalogos/drapana?platform=M18&avail=in-stock")).status).toBe(200);
    }
    const refused = await from("203.0.113.10", "/katalogos/drapana?platform=M12&avail=in-stock");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("3");
    expect(await refused.text()).toContain('name="robots" content="noindex"');
    // Another client is not affected, and neither is the same client's bare listing.
    expect((await from("203.0.113.11", "/katalogos/drapana?platform=M18&avail=in-stock")).status).toBe(200);
    expect((await from("203.0.113.10", "/katalogos/drapana")).status).toBe(200);
  });

  it("limits the suggest API with a JSON 429 after its own burst, without localising it", async () => {
    for (let i = 0; i < 60; i++) {
      const ok = await from("203.0.113.20", "/api/suggest?q=m18");
      expect(ok.status).toBe(200);
      expect(ok.headers.get("x-middleware-next")).toBe("1");
      expect(ok.headers.get("x-middleware-rewrite")).toBeNull();
    }
    const refused = await from("203.0.113.20", "/api/suggest?q=m18");
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ error: "rate_limited" });
    // A separate bucket: the same client's agent-API and listing calls are untouched.
    expect((await from("203.0.113.20", "/api/acp/products?q=x")).status).toBe(200);
  });

  it("leaves a keyed agent call to the route, and limits keyless ones on their own", async () => {
    const keyed = (ip: string) =>
      proxy(
        new NextRequest("https://milwaukeetoolshdc.gr/api/acp/products?q=x", {
          headers: { host: "milwaukeetoolshdc.gr", "cf-connecting-ip": ip, authorization: "Bearer k" },
        }),
      );
    for (let i = 0; i < 150; i++) expect((await keyed("203.0.113.50")).status).toBe(200);
    for (let i = 0; i < 30; i++) expect((await from("203.0.113.51", "/api/acp/products?q=x")).status).toBe(200);
    expect((await from("203.0.113.51", "/api/acp/products?q=x")).status).toBe(429);
  });

  it("limits the database check at 30 a minute", async () => {
    for (let i = 0; i < 10; i++) expect((await from("203.0.113.52", "/api/ready")).status).toBe(200);
    expect((await from("203.0.113.52", "/api/ready")).status).toBe(429);
  });

  it("never answers 429 to deep load-more on a bare category", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await from("203.0.113.53", `/katalogos/drapana?page=${5 + (i % 40)}`)).status).toBe(200);
    }
  });

  it("gives a bare search its own, wider bucket", async () => {
    for (let i = 0; i < 20; i++) expect((await from("203.0.113.54", "/anazitisi?q=m18")).status).toBe(200);
    expect((await from("203.0.113.54", "/anazitisi?q=m18")).status).toBe(429);
  });

  it("counts a platform landing as an unfiltered listing, not a filtered view", async () => {
    for (let i = 0; i < 15; i++) {
      expect((await from("203.0.113.40", "/katalogos/drapana?platform=M18")).status).toBe(200);
    }
  });

  it("never limits a POST (Server Actions, the cart)", async () => {
    for (let i = 0; i < 15; i++) {
      expect((await from("203.0.113.30", "/katalogos/drapana?platform=M18&avail=in-stock", "POST")).status).not.toBe(429);
    }
  });
});
