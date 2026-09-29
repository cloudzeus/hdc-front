import { prisma } from "@/lib/prisma";

/**
 * One run per interval, however many servers are ticking.
 *
 * Every replica of the shop runs the same timers, so each of them will decide
 * "it is time" at roughly the same moment. The decision has to be made once,
 * in the database, not in a flag that lives in one process: the row in
 * `sync_state` for the job is updated only if its last run is older than the
 * gap, and the UPDATE is atomic, so exactly one replica gets a row back.
 * The others see zero rows and skip this round.
 *
 * The clock is the database's, in UTC. The columns are `timestamp` without a
 * zone and Prisma writes them as UTC, so a bare `now()` would be stored in the
 * server's local time (Europe/Athens is UTC+2/+3) and every comparison would be
 * off by hours.
 */
export async function claimSlot(channel: string, minGapMs: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE sync_state
       SET "lastRunAt" = (now() AT TIME ZONE 'UTC'),
           "lastStatus" = 'RUNNING',
           "updatedAt" = (now() AT TIME ZONE 'UTC')
     WHERE channel = ${channel}
       AND ("lastRunAt" IS NULL
            OR "lastRunAt" <= (now() AT TIME ZONE 'UTC') - make_interval(secs => ${minGapMs / 1000}))
    RETURNING id`;
  return rows.length === 1;
}

/**
 * Make sure the job's row exists, so `claimSlot` has something to update.
 *
 * Two replicas booting together can both try to create it; the loser hits the
 * unique channel and that is fine — the row is there either way.
 */
export async function ensureSlot(channel: string): Promise<void> {
  try {
    await prisma.syncState.upsert({ where: { channel }, create: { channel }, update: {} });
  } catch {
    // Created by another replica at the same moment.
  }
}

/** Record how the claimed run ended, for the admin sync monitor. */
export async function finishSlot(channel: string, ok: boolean): Promise<void> {
  await prisma.syncState.update({
    where: { channel },
    data: ok
      ? { lastStatus: "SUCCESS", lastSuccessAt: new Date() }
      : { lastStatus: "FAILED" },
  });
}
