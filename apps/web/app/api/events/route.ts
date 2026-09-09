import { NextRequest, NextResponse } from "next/server";
import { pool } from "@gluconimbus/db";
import { newRequestId } from "@/lib/request-id";

/**
 * GET /api/events?participantId=001&limit=20
 * Context events currently come from the dataset's food log. Activity data is
 * intentionally absent until its large wearable source is added (data/README).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  const params = new URL(request.url).searchParams;
  const participantId = params.get("participantId") ?? "001";
  const requestedLimit = Number(params.get("limit") ?? "20");
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 20;

  const result = await pool.query(
    `SELECT event_id, "timestamp", description, carbs_grams, calories, source
     FROM meal_events WHERE participant_id = $1
     ORDER BY "timestamp" DESC LIMIT $2`,
    [participantId, limit],
  );

  return NextResponse.json({
    requestId,
    participantId,
    events: result.rows.map((row) => ({
      eventId: row.event_id as string,
      type: "meal" as const,
      timestamp: (row.timestamp as Date).toISOString(),
      description: (row.description as string | null) ?? null,
      carbsGrams: row.carbs_grams === null ? null : Number(row.carbs_grams),
      calories: row.calories === null ? null : Number(row.calories),
      source: row.source as string,
    })),
  });
}
