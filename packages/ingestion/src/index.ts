import type { CanonicalGlucoseEvent } from "@gluconimbus/types";
import { canonicalGlucoseEventSchema } from "@gluconimbus/validation";
import { upsertGlucoseReading, recordProcessingEvent, listFailureRules, type Pool } from "@gluconimbus/db";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface QueuedReading {
  requestId: string;
  event: unknown; // untrusted until validated below, whichever queue it arrived from
}

/**
 * Archives a raw payload and reports whether it succeeded — never throws
 * (mirrors `packages/cloud`'s S3 client's own contract). Injected rather
 * than imported so this module never depends on `@aws-sdk/client-s3` or
 * any Cloudflare binding directly.
 */
export type ArchiveFn = (participantId: string, eventId: string, payload: unknown) => Promise<boolean>;

export interface ProcessReadingDeps {
  pool: Pool;
  archive: ArchiveFn;
}

export interface ProcessResult {
  status: "persisted" | "duplicate";
  eventId: string;
}

/**
 * The one piece of Phase 3 business logic every consumer runtime shares.
 * `apps/workers` (Node, long-polling SQS) and `apps/workers-cf`
 * (Cloudflare Queues consumer Worker) both call this instead of each
 * having their own copy — the only things that differ between them are
 * *how* a Postgres connection is obtained (a shared `pg.Pool` singleton
 * vs. a per-request Hyperdrive-backed one) and *how* the raw payload gets
 * archived (S3-via-LocalStack vs. an R2 binding), both passed in via
 * `deps` rather than imported. See docs/adr/0009-cloudflare-deployment.md.
 *
 * Deliberately does NOT catch its own errors: a thrown error means the
 * caller must not acknowledge the message, so the underlying queue's own
 * retry/redrive policy (SQS's redelivery, or Cloudflare's
 * `message.retry()` + `dead_letter_queue`) handles the retry — no custom
 * retry code lives here or in either caller.
 */
export async function processReading(message: QueuedReading, deps: ProcessReadingDeps): Promise<ProcessResult> {
  const start = Date.now();
  const parsed = canonicalGlucoseEventSchema.safeParse(message.event);

  if (!parsed.success) {
    const durationMs = Date.now() - start;
    const error = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    await recordProcessingEvent(
      {
        requestId: message.requestId,
        operation: "ProcessReading",
        status: "failed",
        error,
        durationMs,
        archived: false,
      },
      deps.pool,
    );
    // Not retryable — a malformed body will never become valid on
    // redelivery. Thrown anyway so it isn't silently acknowledged; it
    // exhausts the queue's own retry count and lands in that queue's DLQ
    // for a human to look at, same as any other processing failure.
    throw new Error(`Malformed message body: ${error}`);
  }

  const event: CanonicalGlucoseEvent = parsed.data;

  // Phase 6 reliability demonstration (spec Section 5) — developer-toggled
  // failure injection, checked after validation (a malformed message
  // should always fail the same way regardless of what's configured) but
  // before archive/persist. A rule's mere presence means it's active; see
  // docs/adr/0013-failure-injection.md for the probability-roll and
  // db_outage-still-writes-the-audit-row reasoning.
  for (const rule of await listFailureRules("processing", deps.pool)) {
    if (Math.random() >= rule.probability) continue;

    if (rule.failureType === "delay") {
      if (rule.delayMs) await sleep(rule.delayMs);
      continue;
    }

    const durationMs = Date.now() - start;
    const label = rule.failureType === "db_outage" ? "database unavailable" : "processor failure";
    const error = `Injected failure (rule ${rule.id}): simulated ${label}`;
    await recordProcessingEvent(
      { requestId: message.requestId, eventId: event.eventId, operation: "ProcessReading", status: "failed", error, durationMs, archived: false },
      deps.pool,
    );
    // Same contract as the validation-failure path above: throw, don't
    // swallow, so the caller leaves the message on the queue and the
    // queue's own retry/redrive policy is what the developer is actually
    // here to watch happen.
    throw new Error(error);
  }

  const archived = await deps.archive(event.participantId, event.eventId, event);
  const { persisted } = await upsertGlucoseReading(event, deps.pool);
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
    deps.pool,
  );

  return { status: persisted ? "persisted" : "duplicate", eventId: event.eventId };
}
