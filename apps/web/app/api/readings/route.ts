import { NextRequest, NextResponse } from "next/server";
import type { AppErrorBody } from "@gluconimbus/types";
import { ingestReadingsRequestSchema, normalizeIngestRequest } from "@gluconimbus/validation";
import { publishReadingBatch } from "@gluconimbus/cloud";
import { pool } from "@gluconimbus/db";
import { newRequestId } from "@/lib/request-id";

/**
 * POST /api/readings — ingestion boundary the simulator (and later a real
 * sensor SDK) publishes to. Validates and publishes to the SQS ingest
 * queue; `apps/workers` is what actually persists (docs/adr/0008). This
 * route no longer touches Postgres or S3 directly — that's the whole
 * point of decoupling producer from processor in Phase 3.
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

  try {
    await publishReadingBatch(events, requestId);
  } catch (err) {
    console.error(`[ingest] failed to publish to SQS:`, err);
    return errorResponse("QUEUE_UNAVAILABLE", "Ingestion queue is unreachable.", requestId, true, 503);
  }

  console.log(
    JSON.stringify({
      requestId,
      operation: "PublishReadings",
      count: events.length,
      durationMs: Date.now() - start,
    }),
  );

  // 202: accepted for async processing. The old direct-write response's
  // persisted/duplicate counts are gone on purpose — that outcome isn't
  // known at publish time anymore. Poll GET /api/readings or
  // /api/processing-events to see what the worker actually did with it.
  return NextResponse.json({ requestId, received: events.length, status: "queued" }, { status: 202 });
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
