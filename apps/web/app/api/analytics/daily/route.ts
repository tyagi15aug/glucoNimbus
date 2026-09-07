import { NextRequest, NextResponse } from "next/server";
import { pool } from "@gluconimbus/db";
import { newRequestId } from "@/lib/request-id";

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

  const day = dateParam ?? new Date().toISOString().slice(0, 10);

  const result = await pool.query(
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

  const row = result.rows[0];

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
