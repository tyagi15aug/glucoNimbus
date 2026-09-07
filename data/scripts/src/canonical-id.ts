import { v5 as uuidv5 } from "uuid";

/**
 * Fixed namespace for GlucoStream-derived event IDs. Arbitrary but stable —
 * changing it would silently "duplicate" every previously-ingested reading
 * on the next replay, so it's a constant, not configuration.
 */
const GLUCOSTREAM_NAMESPACE = "d3f1c1a0-6b1e-4c2a-9c3e-2f8f6a5b7d10";

/**
 * Deterministic eventId for a replayed reading. Same (deviceId,
 * participantId, timestamp) always produces the same ID, which is what
 * makes idempotent re-ingestion possible without a separate "have I seen
 * this row before" lookup at parse time — see
 * docs/adr/0003-idempotency.md.
 */
export function deriveEventId(deviceId: string, participantId: string, timestamp: string): string {
  return uuidv5(`${deviceId}:${participantId}:${timestamp}`, GLUCOSTREAM_NAMESPACE);
}
