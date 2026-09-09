import { NextRequest, NextResponse } from "next/server";
import { summarizeGlucose } from "@gluconimbus/analytics";
import { pool } from "@gluconimbus/db";
import { newRequestId } from "@/lib/request-id";

interface ReadingRow {
  day: string;
  glucose: number;
}

function parseDays(raw: string | null): number {
  const parsed = Number(raw ?? "7");
  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, 90) : 7;
}

/**
 * GET /api/analytics/trends?participantId=001&days=7
 *
 * Returns chronological UTC-day buckets plus a comparison with the previous
 * equal-length window. Empty days are represented explicitly so consumers can
 * draw an honest historical chart rather than silently joining distant dates.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  const params = new URL(request.url).searchParams;
  const participantId = params.get("participantId") ?? "001";
  const days = parseDays(params.get("days"));

  const latestResult = await pool.query(
    `SELECT max("timestamp")::date::text AS day FROM glucose_readings WHERE participant_id = $1`,
    [participantId],
  );
  const endDate = latestResult.rows[0]?.day as string | null | undefined;
  if (!endDate) {
    return NextResponse.json({ requestId, participantId, days, series: [], comparison: null });
  }

  const readings = await pool.query<ReadingRow>(
    `SELECT ("timestamp" AT TIME ZONE 'UTC')::date::text AS day, glucose
     FROM glucose_readings
     WHERE participant_id = $1
       AND "timestamp" >= ($2::date - (($3 * 2) - 1) * interval '1 day')
       AND "timestamp" < ($2::date + interval '1 day')
     ORDER BY "timestamp" ASC`,
    [participantId, endDate, days],
  );

  const valuesByDay = new Map<string, number[]>();
  for (const row of readings.rows) {
    const values = valuesByDay.get(row.day) ?? [];
    values.push(Number(row.glucose));
    valuesByDay.set(row.day, values);
  }

  const end = new Date(`${endDate}T00:00:00.000Z`);
  const series = Array.from({ length: days }, (_, index) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - (days - 1 - index));
    const date = day.toISOString().slice(0, 10);
    return { date, ...summarizeGlucose(valuesByDay.get(date) ?? []) };
  });

  const current = summarizeGlucose(series.flatMap((bucket) => valuesByDay.get(bucket.date) ?? []));
  const previousDates = Array.from({ length: days }, (_, index) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - ((days * 2) - 1 - index));
    return day.toISOString().slice(0, 10);
  });
  const previous = summarizeGlucose(previousDates.flatMap((date) => valuesByDay.get(date) ?? []));

  return NextResponse.json({
    requestId,
    participantId,
    days,
    endDate,
    series,
    comparison: {
      current,
      previous,
      averageDelta: current.average !== null && previous.average !== null ? Number((current.average - previous.average).toFixed(1)) : null,
    },
  });
}
