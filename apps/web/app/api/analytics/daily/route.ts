import { NextRequest, NextResponse } from "next/server";
import { pool, type Pool } from "@gluconimbus/db";
import { newRequestId } from "@/lib/request-id";

interface DailyRow {
  count: number;
  average: string | null;
  min: string | null;
  max: string | null;
  stddev: string | null;
}

async function queryDay(target: Pool, participantId: string, day: string): Promise<DailyRow | undefined> {
  const result = await target.query(
    `SELECT
       count(*)::int AS count,
       avg(glucose) AS average,
       min(glucose) AS min,
       max(glucose) AS max,
       stddev_pop(glucose) AS stddev
     FROM glucose_readings
     WHERE participant_id = $1
       AND "timestamp" >= $2::date
       AND "timestamp" < ($2::date + interval '1 day')`,
    [participantId, day],
  );
  return result.rows[0] as DailyRow | undefined;
}

/**
 * GET /api/analytics/daily?participantId=001&date=2020-02-13
 * Deterministic analytics only (spec Section 10) — average, min/max,
 * reading count for one UTC calendar day. No diagnostic framing anywhere
 * in the response.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  const { searchParams } = new URL(request.url);
  const participantId = searchParams.get("participantId") ?? "001";
  const dateParam = searchParams.get("date");

  let day = dateParam ?? new Date().toISOString().slice(0, 10);
  let row = await queryDay(pool, participantId, day);

  // The dashboard calls this with no `date` — it means "today" — but the
  // simulator replays historical/synthetic data whose emitted timestamps
  // can legitimately land on a different calendar day than the server's
  // real clock (a fast-forward `--speed=100x` replay races ahead of real
  // time; a short run of raw historical data can still be behind it). An
  // explicit `?date=` (e.g. for debugging against known historical data)
  // is honored exactly as asked and never overridden.
  if ((!row || row.count === 0) && !dateParam) {
    const latest = await pool.query(
      `SELECT max("timestamp")::date AS day FROM glucose_readings WHERE participant_id = $1`,
      [participantId],
    );
    const latestDay = latest.rows[0]?.day as Date | null | undefined;
    if (latestDay) {
      day = latestDay.toISOString().slice(0, 10);
      row = await queryDay(pool, participantId, day);
    }
  }

  if (!row || row.count === 0) {
    return NextResponse.json({
      requestId,
      participantId,
      date: day,
      count: 0,
      average: null,
      min: null,
      max: null,
      standardDeviation: null,
    });
  }

  return NextResponse.json({
    requestId,
    participantId,
    date: day,
    count: row.count,
    average: row.average === null ? null : Number(Number(row.average).toFixed(1)),
    min: row.min === null ? null : Number(row.min),
    max: row.max === null ? null : Number(row.max),
    standardDeviation: row.stddev === null ? null : Number(Number(row.stddev).toFixed(1)),
  });
}
