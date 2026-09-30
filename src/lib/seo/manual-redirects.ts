/**
 * Manual 301s — the ones added by hand in the admin (`RedirectRule`).
 *
 * They are checked FIRST in the proxy, before the Magento table, so a person
 * can always correct an automatic mapping. And they are read from memory, not
 * from the database per request: the rules are loaded once, kept, and
 * refreshed in the background when they are older than a minute. A page view
 * never waits on a query for a redirect that almost never exists.
 *
 * Pure: no Prisma here. The loader takes a `load` function, so the proxy can
 * hand it the database and the tests a list.
 */

export type ManualRule = { id: string; fromPath: string; toPath: string };

export type ManualHit = { id: string; to: string };

export type ManualResolver = (pathname: string) => ManualHit | null;

/**
 * One spelling per path: decoded, lower case, no trailing slash (except the
 * root), no query or fragment. `/Proion/X/` and `/proion/x` are the same rule.
 */
export function normalizeRedirectPath(path: string): string {
  let p = path.trim().split(/[?#]/, 1)[0] ?? "";
  try {
    p = decodeURI(p);
  } catch {
    // A malformed escape stays as typed; it can still match itself.
  }
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p.toLowerCase();
}

/**
 * Rules → lookup. A rule that points at itself is dropped (it would loop), and
 * so is one whose target is another rule's source that leads back — a chain is
 * followed at most a few hops and cut if it circles.
 */
export function createManualResolver(rules: ManualRule[]): ManualResolver {
  const byFrom = new Map<string, ManualRule>();
  for (const rule of rules) {
    const from = normalizeRedirectPath(rule.fromPath);
    if (!rule.toPath.trim()) continue;
    if (normalizeRedirectPath(rule.toPath) === from) continue;
    byFrom.set(from, rule);
  }

  return (pathname) => {
    const first = byFrom.get(normalizeRedirectPath(pathname));
    if (!first) return null;
    // Follow a chain (a → b → c) to its end so the visitor makes one hop.
    let rule = first;
    const seen = new Set([normalizeRedirectPath(first.fromPath)]);
    for (let i = 0; i < 5; i++) {
      if (/^https?:\/\//i.test(rule.toPath)) break;
      const next = byFrom.get(normalizeRedirectPath(rule.toPath));
      if (!next) break;
      const key = normalizeRedirectPath(next.fromPath);
      if (seen.has(key)) return null; // a loop: redirect nowhere rather than forever
      seen.add(key);
      rule = next;
    }
    return { id: first.id, to: rule.toPath.trim() };
  };
}

/**
 * The rules in memory, refreshed at most every `ttlMs`.
 *
 * The first call waits for the load — at most `timeoutMs` — and after that a
 * stale copy is served while one refresh runs in the background. A failed or
 * slow load keeps the last good copy (or none): a database hiccup must not
 * turn into a 500, or a hang, on every page.
 */
export function createManualRedirectCache(options: {
  load: () => Promise<ManualRule[]>;
  ttlMs?: number;
  /** A load slower than this counts as failed: the proxy never waits longer. */
  timeoutMs?: number;
  now?: () => number;
}): () => Promise<ManualResolver> {
  const ttl = options.ttlMs ?? 60_000;
  const timeout = options.timeoutMs ?? 3_000;
  const now = options.now ?? Date.now;
  let resolver: ManualResolver | null = null;
  let loadedAt = 0;
  let inflight: Promise<ManualResolver> | null = null;

  const bounded = () =>
    new Promise<ManualRule[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`manual redirects: no answer in ${timeout}ms`)), timeout);
      options.load().then(
        (rules) => {
          clearTimeout(timer);
          resolve(rules);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });

  const refresh = () => {
    inflight ??= bounded()
      .then((rules) => {
        resolver = createManualResolver(rules);
        return resolver;
      })
      .catch((error) => {
        console.error("[redirects] could not load the manual rules", error);
        resolver ??= () => null;
        return resolver;
      })
      .finally(() => {
        loadedAt = now();
        inflight = null;
      });
    return inflight;
  };

  return async () => {
    if (!resolver) return refresh();
    if (now() - loadedAt > ttl) void refresh();
    return resolver;
  };
}
