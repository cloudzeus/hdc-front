/**
 * At most 10 VIES checks per cart session in any 10 minutes — the checkout's
 * «Έλεγχος» and blur both ask, and HDCtool asks the EU. In memory, per
 * process, like `lib/security/rate-limit`: one container serves the shop.
 */
export const VAT_CHECK_LIMIT = 10;
export const VAT_CHECK_WINDOW_MS = 10 * 60 * 1000;
const MAX_KEYS = 10_000;

export class VatCheckLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit = VAT_CHECK_LIMIT,
    private readonly windowMs = VAT_CHECK_WINDOW_MS,
  ) {}

  /** True and counted when a check may go out now; false when over the limit. */
  take(key: string, now: number = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    // Oldest-touched first: drop from the front when the map grows too big.
    while (this.hits.size > MAX_KEYS) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
    return true;
  }
}
