import type { CanonicalGlucoseEvent } from "@gluconimbus/types";
import { canonicalGlucoseEventSchema } from "@gluconimbus/validation";
import { upsertGlucoseReading, recordProcessingEvent, pool, type Pool } from "@gluconimbus/db";
import { archiveRawEvent } from "@gluconimbus/cloud";
import type { QueuedReading } from "@gluconimbus/cloud";

export interface ProcessResult {
  status: "persisted" | "duplicate";
  eventId: string;
}

/**
 * The worker's entire business logic, isolated from the SQS
 * receive/delete loop around it (src/index.ts) so it can be unit-tested
 * against a real local Postgres without any LocalStack/SQS involved —
 * see test/process-message.test.ts. The queue wiring itself can only be
 * exercised on a machine that can actually run LocalStack, which this
 * sandbox cannot (docs/adr/0008-event-driven-pipeline.md).
 *
 * Deliberately does NOT catch its own errors: a thrown error here means
 * the caller must not delete the message, so SQS's visibility timeout
 * redelivers it, and after the queue's maxReceiveCount is exceeded the
 * redrive policy moves it to the DLQ automatically — that's the
 * retry/failure story (spec Section 9), not custom retry code in this
 * function.
 */
export async function processMessage(message: QueuedReading, target: Pool = pool): Promise<ProcessResult> {
  const start = Date.now();
  const parsed = canonicalGlucoseEventSchema.safeParse(message.event);

  if (!parsed.success) {
    const durationMs = Date.now() - start;
    const error = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    await recordProcessingEvent(
      { requestId: message.requestId, operation: "ProcessReading", status: "failed", error, durationMs, archived: false },
      target,
    );
    // Not retryable — a malformed body will never become valid on
    // redelivery. Thrown anyway so it isn't silently deleted; it will
    // exhaust the queue's maxReceiveCount and land in the DLQ for a human
    // to look at, same as any other processing failure.
    throw new Error(`Malformed message body: ${error}`);
  }

  const event: CanonicalGlucoseEvent = parsed.data;
  const archived = await archiveRawEvent(event.participantId, event.eventId, event);
  const { persisted } = await upsertGlucoseReading(event, target);
  const durationMs = Date.now() - start;

  await recordProcessingEvent(
    {
      requestId: message.requestId,
      eventId: event.eventId,
      operation: "ProcessReading",
      status: persisted ? "persisted" : "duplicate",
      durationMs,
      archived,
    },
    target,
  );

  return { status: persisted ? "persisted" : "duplicate", eventId: event.eventId };
}
