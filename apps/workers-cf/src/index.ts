import { Pool } from "pg";
import { processReading, type ArchiveFn, type QueuedReading } from "@gluconimbus/ingestion";

interface Env {
  HYPERDRIVE: Hyperdrive;
  RAW_BUCKET: R2Bucket;
}

/**
 * R2-backed counterpart to packages/cloud's S3-via-LocalStack
 * `archiveRawEvent` — same key shape, same never-throws contract, native
 * R2 binding instead of the AWS SDK (no need for it inside a Worker that
 * already has the bucket bound).
 */
function makeR2Archive(bucket: R2Bucket): ArchiveFn {
  return async (participantId, eventId, payload) => {
    try {
      await bucket.put(`raw/${participantId}/${eventId}.json`, JSON.stringify(payload), {
        httpMetadata: { contentType: "application/json" },
      });
      return true;
    } catch (err) {
      console.error(`[r2] failed to archive event ${eventId}:`, err);
      return false;
    }
  };
}

/**
 * Cloudflare Queues consumer — the public-deployment counterpart to
 * apps/workers' Node/SQS poll loop, same business logic
 * (@gluconimbus/ingestion's processReading), different runtime adapters:
 * a fresh `pg.Pool` per batch against Hyperdrive (Hyperdrive already
 * pools at the edge — this Worker isn't a long-running process, so there
 * is nothing to hold a singleton pool across invocations the way
 * packages/db's Node-side `pool` singleton does) and an R2 binding
 * instead of the S3 SDK. See docs/adr/0009-cloudflare-deployment.md for
 * the full reasoning, including what remains unverified without a real
 * deployment.
 *
 * Retry semantics mirror the SQS side exactly: a failed message calls
 * `message.retry()` (Cloudflare redelivers it up to `max_retries`, per
 * wrangler.jsonc) rather than being acknowledged; after that it lands on
 * `gluconimbus-ingest-dlq` automatically. No custom retry logic here,
 * same as apps/workers.
 */
export default {
  async queue(batch: MessageBatch<QueuedReading>, env: Env): Promise<void> {
    const pool = new Pool({ connectionString: env.HYPERDRIVE.connectionString, max: 5 });
    const archive = makeR2Archive(env.RAW_BUCKET);

    try {
      for (const message of batch.messages) {
        try {
          const result = await processReading(message.body, { pool, archive });
          message.ack();
          console.log(
            JSON.stringify({
              requestId: message.body.requestId,
              eventId: result.eventId,
              status: result.status,
            }),
          );
        } catch (err) {
          console.error("[workers-cf] failed to process message (will retry):", err);
          message.retry();
        }
      }
    } finally {
      await pool.end();
    }
  },
} satisfies ExportedHandler<Env, QueuedReading>;
