/**
 * Pages of the new shop that moved for good: a 301 from the proxy
 * (src/proxy.ts), with the language prefix kept. Shared with the admin's
 * redirect checks, so a manual 301 cannot close a loop through one of these.
 */
export const MOVED: Readonly<Record<string, string>> = {
  "/brands/milwaukee": "/milwaukee",
};
