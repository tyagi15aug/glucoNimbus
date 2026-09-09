import { NextResponse } from "next/server";
import { getIngestQueueDepth } from "@gluconimbus/cloud";
import { listRecentProcessingEvents, pool } from "@gluconimbus/db";
import { newRequestId } from "@/lib/request-id";

type Status = "ready" | "active" | "idle" | "unreachable" | "unknown";

function isRecent(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 5 * 60 * 1000;
}

/**
 * GET /api/system-status — demo-oriented operational view. It intentionally
 * reports unknown/unreachable states instead of fabricating health when the
 * local infrastructure is off, which makes cold starts and failure injection
 * visible to a reviewer.
 */
export async function GET(): Promise<NextResponse> {
  const requestId = newRequestId();
  let database: Status = "unreachable";
  let lastEvent: Awaited<ReturnType<typeof listRecentProcessingEvents>>[number] | null = null;

  try {
    await pool.query("SELECT 1");
    database = "ready";
    lastEvent = (await listRecentProcessingEvents(1))[0] ?? null;
  } catch (error) {
    console.error("[system-status] database check failed:", error);
  }

  let queue: Status = "unreachable";
  let queueDepth: { visible: number; inFlight: number; delayed: number } | null = null;
  try {
    const depth = await getIngestQueueDepth();
    queueDepth = depth;
    queue = depth.visible > 0 || depth.inFlight > 0 ? "active" : "ready";
  } catch (error) {
    console.error("[system-status] queue check failed:", error);
  }

  const processor: Status = lastEvent ? (lastEvent.status === "failed" ? "unreachable" : isRecent(lastEvent.createdAt) ? "active" : "idle") : "idle";
  const ingestion: Status = lastEvent && isRecent(lastEvent.createdAt) ? "active" : "idle";

  return NextResponse.json({
    requestId,
    updatedAt: new Date().toISOString(),
    stages: [
      { id: "dataset", label: "Research data", detail: "Canonical replay input", status: "ready" as Status },
      { id: "simulator", label: "Simulator", detail: "CLI replay or synthetic continuation", status: "idle" as Status },
      { id: "ingestion", label: "Ingestion API", detail: "Validated HTTP publish", status: ingestion },
      {
        id: "queue",
        label: "SQS queue",
        detail: queueDepth ? `${queueDepth.visible} waiting · ${queueDepth.inFlight} processing` : "LocalStack unavailable",
        status: queue,
      },
      { id: "processor", label: "Worker", detail: "Validate, deduplicate, archive, persist", status: processor },
      { id: "database", label: "PostgreSQL", detail: "Readings and processing audit", status: database },
      { id: "dashboard", label: "Live dashboard", detail: "Polling analytics and latest readings", status: "ready" as Status },
    ],
    lastEvent: lastEvent
      ? {
          eventId: lastEvent.eventId,
          status: lastEvent.status,
          durationMs: lastEvent.durationMs,
          createdAt: lastEvent.createdAt,
          error: lastEvent.error,
        }
      : null,
  });
}
