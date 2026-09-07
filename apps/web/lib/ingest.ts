import type { CanonicalGlucoseEventInput } from "@gluconimbus/validation";
import { pool } from "./db";
import { archiveRawEvent } from "./s3";

export interface IngestOutcome {
  eventId: string;
  persisted: boolean; // false means it was already there — the idempotent-duplicate case
  archived: boolean;
}

/**
 * The one place a canonical glucose event actually lands in the system.
 * The API route validates the request shape; this function is the
 * ingestion boundary itself — archive-then-persist, both idempotent.
 *
 * Idempotency (docs/adr/0003-idempotency.md): `event_id` has a unique
 * constraint, and `INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING
 * id` means "insert if new, no-op if we've already recorded this exact
 * reading" as a single atomic statement — no separate existence check
 * racing the insert. Whether a row came back tells us which case happened.
 */
export async function ingestGlucoseEvent(event: CanonicalGlucoseEventInput): Promise<IngestOutcome> {
  const archived = await archiveRawEvent(event.participantId, event.eventId, event);

  const result = await pool.query(
    `INSERT INTO glucose_readings (event_id, device_id, participant_id, "timestamp", glucose, unit, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`,
    [event.eventId, event.deviceId, event.participantId, event.timestamp, event.glucose, event.unit, event.source],
  );

  return { eventId: event.eventId, persisted: (result.rowCount ?? 0) > 0, archived };
}
