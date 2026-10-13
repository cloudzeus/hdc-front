import "server-only";
import { prisma } from "@/lib/prisma";
import { OFFER_REMINDER_HOURS, readStoredOffer } from "@/lib/requests/model";
import { expireRequest, remindRequest } from "@/lib/requests/service";

/**
 * The back-order request timers (docs/backorder-requests.md §6).
 *
 *   - an offer unanswered for 24 hours gets ONE reminder;
 *   - an offer past its `offerExpiresAt` becomes EXPIRED, the customer is told,
 *     and HDCtool hears it through the intake.
 *
 * Runs as the «requests» job of the shop's in-process cron
 * (`src/lib/cron/schedule.ts`), whose `claimSlot` lets one replica run each
 * interval. Each order's transition is itself conditional (`expireRequest`,
 * `remindRequest`), so even two runs at once would send one email per order.
 */

const BATCH = 100;

export type RequestSweepReport = {
  expired: string[];
  reminded: string[];
  errors: Array<{ orderNumber: string; message: string }>;
};

export async function sweepRequests(options: { now?: () => number } = {}): Promise<RequestSweepReport> {
  const started = (options.now ?? Date.now)();
  const now = new Date(started);
  const report: RequestSweepReport = { expired: [], reminded: [], errors: [] };
  const fail = (orderNumber: string, error: unknown) =>
    report.errors.push({ orderNumber, message: error instanceof Error ? error.message : String(error) });

  const due = await prisma.order.findMany({
    where: { requestStatus: "OFFERED", offerExpiresAt: { lte: now } },
    orderBy: { offerExpiresAt: "asc" },
    take: BATCH,
    select: { id: true, orderNumber: true, status: true },
  });
  for (const order of due) {
    try {
      if (await expireRequest(order, now)) report.expired.push(order.orderNumber);
    } catch (error) {
      fail(order.orderNumber, error);
    }
  }

  const waiting = await prisma.order.findMany({
    where: { requestStatus: "OFFERED", offerRemindedAt: null, offerExpiresAt: { gt: now } },
    orderBy: { offerExpiresAt: "asc" },
    take: BATCH,
    select: { id: true, orderNumber: true, offerJson: true },
  });
  const remindBefore = started - OFFER_REMINDER_HOURS * 3_600_000;
  for (const order of waiting) {
    const offer = readStoredOffer(order.offerJson);
    const offeredAt = offer ? Date.parse(offer.receivedAt) : NaN;
    if (!Number.isFinite(offeredAt) || offeredAt > remindBefore) continue;
    try {
      if (await remindRequest(order, now)) report.reminded.push(order.orderNumber);
    } catch (error) {
      fail(order.orderNumber, error);
    }
  }
  return report;
}

export function requestSweepLogLine(report: RequestSweepReport): string {
  return (
    `έληξαν ${report.expired.length} · υπενθυμίσεις ${report.reminded.length} · σφάλματα ${report.errors.length}` +
    (report.expired.length || report.reminded.length
      ? ` (${[...report.expired, ...report.reminded].join(", ")})`
      : "")
  );
}
