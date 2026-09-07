import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { newRequestId } from "@/lib/request-id";

/** GET /api/readings/latest?participantId=001 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  const participantId = new URL(request.url).searchParams.get("participantId") ?? "001";

  const recent = await pool.query(
    `SELECT "timestamp", glucose, unit
     FROM glucose_readings
     WHERE participant_id = $1
     ORDER BY "timestamp" DESC
     LIMIT 2`,
    [participantId],
  );

  const latest = recent.rows[0];
  if (!latest) {
    return NextResponse.json({ requestId, reading: null }, { status: 200 });
  }
  const previous = recent.rows[1];

  const trend =
    previous === undefined
      ? "unknown"
      : latest.glucose > previous.glucose + 3
        ? "rising"
        : latest.glucose < previous.glucose - 3
          ? "falling"
          : "steady";

  const rateOfChange =
    previous === undefined
      ? null
      : (latest.glucose - previous.glucose) /
        ((new Date(latest.timestamp).getTime() - new Date(previous.timestamp).getTime()) / 60000 || 1);

  return NextResponse.json({
    requestId,
    reading: {
      timestamp: (latest.timestamp as Date).toISOString(),
      glucose: Number(latest.glucose),
      unit: latest.unit as string,
    },
    trend,
    rateOfChangePerMinute: rateOfChange === null ? null : Number(rateOfChange.toFixed(2)),
  });
}
