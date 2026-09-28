import { NextRequest, NextResponse } from "next/server";
import { pollCatalogDelta } from "@/lib/sync/delta-poll";

/**
 * Every 5 minutes from Coolify's scheduler:
 *
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<shop>/api/cron/catalog
 *
 * A route, not an in-process timer, for the same reason as /api/cron/orders:
 * the shop can run as several replicas and a timer would run once per
 * replica. Without CRON_SECRET it refuses to run rather than run open.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not set" },
      { status: 503 },
    );
  }

  const offered = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (offered !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pollCatalogDelta();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron:catalog] delta poll failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
