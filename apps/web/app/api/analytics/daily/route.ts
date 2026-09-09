import { NextRequest, NextResponse } from "next/server";
import { pool, type Pool } from "@gluconimbus/db";
import { summarizeGlucose, type GlucoseSummary } from "@gluconimbus/analytics";
import { newRequestId } from "@/lib/request-id";

async function queryDay(target: Pool, participantId: string, day: string): Promise<GlucoseSummary> {
  const result = await target.query(
    `SELECT glucose FROM glucose_readings
     WHERE participant_id = $1
       AND "timestamp" >= $2::date
       AND "timestamp" < ($2::date + interval '1 day')`,
    [participantId, day],
  );
  return summarizeGlucose(result.rows.map((row) => Number(row.glucose)));
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
  if (row.count === 0 && !dateParam) {
    const latest = await pool.query(
      `SELECT max("timestamp")::date AS day FROM glucose_readings WHERE participant_id = $1`,
      [participantId],
    );
    const latestDay = latest.rows[0]?.day as string | Date | null | undefined;
    if (latestDay) {
      day = typeof latestDay === "string" ? latestDay.slice(0, 10) : latestDay.toISOString().slice(0, 10);
      row = await queryDay(pool, participantId, day);
    }
  }

  if (row.count === 0) {
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
    average: row.average,
    min: row.min,
    max: row.max,
    standardDeviation: row.standardDeviation,
    coefficientOfVariation: row.coefficientOfVariation,
  });
}
