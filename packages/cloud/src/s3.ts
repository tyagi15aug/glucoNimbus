import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Points at LocalStack in every environment this project currently runs
 * in. `docs/adr/0004-why-localstack.md` covers why; a real AWS deployment
 * would just be a different set of env vars (Section 18's AWS/Azure
 * mapping documents the equivalent either way). Moved here from
 * `apps/web/lib/s3.ts` in Phase 3 so `apps/workers` — which does the
 * actual archival now, not the API route — can use the same client
 * without duplicating it (docs/adr/0008-event-driven-pipeline.md).
 */
const s3Client = new S3Client({
  endpoint: process.env["AWS_ENDPOINT_URL"] ?? "http://localhost:4566",
  region: process.env["AWS_REGION"] ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env["AWS_ACCESS_KEY_ID"] ?? "test",
    secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"] ?? "test",
  },
});

const RAW_BUCKET = process.env["S3_RAW_BUCKET"] ?? "gluconimbus-raw";

/**
 * Best-effort archival of the raw ingested payload, keyed by the same
 * eventId used for Postgres idempotency. Deliberately never throws — S3
 * being unreachable is not a reason to fail a message the worker can
 * still persist to Postgres; the caller just gets `archived: false` back
 * to log and record on the processing_events row.
 */
export async function archiveRawEvent(participantId: string, eventId: string, payload: unknown): Promise<boolean> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: RAW_BUCKET,
        Key: `raw/${participantId}/${eventId}.json`,
        Body: JSON.stringify(payload),
        ContentType: "application/json",
      }),
    );
    return true;
  } catch (err) {
    console.error(`[s3] failed to archive event ${eventId}:`, err);
    return false;
  }
}
