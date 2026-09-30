import { normalizeRedirectPath, type ManualRule } from "@/lib/seo/manual-redirects";

/**
 * What a manual 301 may be (admin «Ανακατευθύνσεις»). Pure; the action adds
 * the database checks (the destination exists).
 *
 * From: never a path the shop itself needs — checkout, basket, sign-in,
 * account, the API, the admin, Next's files, the home page or a language root
 * — in any language.
 * To: a path of this shop, stored normalised; an absolute URL only on the
 * shop's own host, stored as its path. Never `//host` or `/\host` (a browser
 * reads both as another site), never an `/el` prefix (Greek has none).
 * No loops and no chains longer than five hops, counting the pages that moved
 * for good in the proxy.
 */

const BLOCKED_FROM = /^\/(checkout|kalathi|eisodos|eggrafi|logariasmos|api|admin|_next)(\/|$)/;
const LOCALE = /^\/(en|it)(?=\/|$)/;
export const MAX_HOPS = 5;

export type RedirectCheck = { ok: true; from: string; to: string } | { ok: false; error: string };

export function validateRedirect(input: {
  from: string;
  to: string;
  existing: ManualRule[];
  moved: Readonly<Record<string, string>>;
  /** The shop's host, e.g. milwaukeetoolshdc.gr. */
  canonicalHost: string;
}): RedirectCheck {
  const rawFrom = input.from.trim();
  const rawTo = input.to.trim();
  if (!rawFrom.startsWith("/") || /^\/[/\\]/.test(rawFrom)) return { ok: false, error: "Η διεύθυνση «από» είναι διαδρομή που ξεκινά με /." };
  const from = normalizeRedirectPath(rawFrom);
  const bare = from.replace(LOCALE, "") || "/";
  if (bare === "/" || from === "/el" || BLOCKED_FROM.test(bare)) {
    return { ok: false, error: "Αυτή η διαδρομή δεν ανακατευθύνεται: τη χρειάζεται το ίδιο το κατάστημα." };
  }

  let target = rawTo;
  if (/^https?:\/\//i.test(target)) {
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      return { ok: false, error: "Ο προορισμός δεν είναι έγκυρη διεύθυνση." };
    }
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== input.canonicalHost.toLowerCase()) {
      return { ok: false, error: `Εξωτερικός προορισμός επιτρέπεται μόνο στο ${input.canonicalHost}.` };
    }
    target = url.pathname;
  }
  if (!target.startsWith("/") || /^\/[/\\]/.test(target) || target.includes("\\")) {
    return { ok: false, error: "Ο προορισμός είναι διαδρομή του καταστήματος (/…)." };
  }
  const to = normalizeRedirectPath(target);
  if (/^\/el(\/|$)/.test(to)) return { ok: false, error: "Οι ελληνικές διευθύνσεις δεν έχουν πρόθεμα /el." };
  if (to === from) return { ok: false, error: "Ο προορισμός είναι η ίδια διεύθυνση." };

  // Follow the new rule through the others and the moved pages.
  const next = new Map<string, string>();
  for (const [a, b] of Object.entries(input.moved)) next.set(normalizeRedirectPath(a), normalizeRedirectPath(b));
  for (const r of input.existing) {
    if (!/^https?:\/\//i.test(r.toPath)) next.set(normalizeRedirectPath(r.fromPath), normalizeRedirectPath(r.toPath));
  }
  next.set(from, to);
  const seen = new Set([from]);
  let at = to;
  let hops = 1;
  while (next.has(at)) {
    if (seen.has(at)) return { ok: false, error: "Δημιουργεί βρόχο με άλλη ανακατεύθυνση." };
    seen.add(at);
    at = next.get(at)!;
    hops++;
    if (hops > MAX_HOPS) return { ok: false, error: `Αλυσίδα πάνω από ${MAX_HOPS} βήματα: δείξτε κατευθείαν στον τελικό προορισμό.` };
  }
  if (seen.has(at)) return { ok: false, error: "Δημιουργεί βρόχο με άλλη ανακατεύθυνση." };
  return { ok: true, from, to };
}
