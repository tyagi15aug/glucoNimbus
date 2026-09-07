import { NextRequest, NextResponse } from "next/server";
import { listRecentProcessingEvents } from "@gluconimbus/db";
import { newRequestId } from "@/lib/request-id";

/**
 * GET /api/processing-events?limit=50 — the Phase 8 observability window
 * (spec Section 16): every message `apps/workers` handled, success or
 * failure, in the order it happened. This is deliberately a thin read
 * over the same `processing_events` table the worker writes
 * (docs/adr/0008) rather than a separate metrics pipeline — for a
 * portfolio-scale demo, the audit log *is* the metrics source.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") ?? "50"), 200);

  const events = await listRecentProcessingEvents(limit);

  return NextResponse.json({ requestId, events });
}
