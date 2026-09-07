import { NextRequest, NextResponse } from "next/server";
import type { AppErrorBody } from "@gluconimbus/types";
import { ingestReadingsRequestSchema, normalizeIngestRequest } from "@gluconimbus/validation";
import { ingestGlucoseEvent } from "@/lib/ingest";
import { pool } from "@/lib/db";
import { newRequestId } from "@/lib/request-id";

/**
 * POST /api/readings — ingestion boundary the simulator (and later a real
 * sensor SDK) publishes to. Accepts one reading or a batch.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  const start = Date.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON.", requestId, false, 400);
  }

  const parsed = ingestReadingsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_FAILED",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      requestId,
      false,
      422,
    );
  }

  const events = normalizeIngestRequest(parsed.data);
  const outcomes = await Promise.all(events.map(ingestGlucoseEvent));

  const persisted = outcomes.filter((o) => o.persisted).length;
  const duplicates = outcomes.length - persisted;

  console.log(
    JSON.stringify({
      requestId,
      operation: "IngestReadings",
      count: outcomes.length,
      persisted,
      duplicates,
      durationMs: Date.now() - start,
    }),
  );

  return NextResponse.json({ requestId, received: outcomes.length, persisted, duplicates }, { status: 202 });
}

/**
 * GET /api/readings?participantId=001&limit=200 — recent readings for a
 * participant, oldest first (chart-ready order; Section 14's `GET
 * /api/readings`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  const { searchParams } = new URL(request.url);
  const participantId = searchParams.get("participantId") ?? "001";
  const limit = Math.min(Number(searchParams.get("limit") ?? "200"), 1000);

  const result = await pool.query(
    `SELECT event_id, device_id, participant_id, "timestamp", glucose, unit, source
     FROM glucose_readings
     WHERE participant_id = $1
     ORDER BY "timestamp" DESC
     LIMIT $2`,
    [participantId, limit],
  );

  const readings = result.rows
    .map((r) => ({ timestamp: (r.timestamp as Date).toISOString(), glucose: Number(r.glucose) }))
    .reverse();

  return NextResponse.json({ requestId, participantId, readings });
}

function errorResponse(
  code: string,
  message: string,
  requestId: string,
  retryable: boolean,
  status: number,
): NextResponse<AppErrorBody> {
  return NextResponse.json({ error: { code, message, requestId, retryable } }, { status });
}
