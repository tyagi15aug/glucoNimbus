import { pool, type Pool } from "@gluconimbus/db";
import { archiveRawEvent } from "@gluconimbus/cloud";
import { processReading, type ProcessResult, type QueuedReading } from "@gluconimbus/ingestion";

/**
 * Thin Node/SQS-flavored wrapper around the shared processing logic:
 * supplies this runtime's Postgres pool and S3-via-LocalStack archival.
 * The actual business logic — validate, archive, upsert, record — lives
 * in @gluconimbus/ingestion so apps/workers-cf (the Cloudflare Queues
 * consumer) can reuse it unchanged with Hyperdrive + R2 instead. See
 * docs/adr/0009-cloudflare-deployment.md.
 */
export async function processMessage(message: QueuedReading, target: Pool = pool): Promise<ProcessResult> {
  return processReading(message, { pool: target, archive: archiveRawEvent });
}
