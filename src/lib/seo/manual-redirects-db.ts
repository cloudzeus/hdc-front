import { prisma } from "@/lib/prisma";
import type { ManualRule } from "@/lib/seo/manual-redirects";

/**
 * The database side of the manual redirects, imported lazily by the proxy
 * (src/proxy.ts) so that nothing touches Prisma until a request needs it.
 */
export async function loadManualRules(): Promise<ManualRule[]> {
  return prisma.redirectRule.findMany({
    where: { source: "MANUAL" },
    select: { id: true, fromPath: true, toPath: true },
  });
}

/** Counts a use. Fire and forget: a redirect never waits on the counter. */
export function recordManualHit(id: string): void {
  void prisma.redirectRule
    .update({ where: { id }, data: { hits: { increment: 1 }, lastHitAt: new Date() } })
    .catch((error) => console.error("[redirects] could not count a hit", error));
}
