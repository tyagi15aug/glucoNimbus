# ADR 0003: Idempotency via a deterministic eventId + upsert

## Context

Spec Section 8 calls out idempotency as an explicit senior-level requirement: the same event arriving twice (a real possibility once SQS/at-least-once delivery lands in Phase 3, and already exercisable today via the simulator's `--duplicate-rate` flag) must persist exactly one logical reading.

## Decision

- Every canonical event carries a stable `eventId`. For replayed data it's a deterministic UUIDv5 of `(deviceId, participantId, timestamp)` — re-running the simulator over the same historical window can never mint a "new" ID for a reading it's already sent.
- `glucose_readings.event_id` has a unique constraint in Postgres, and ingestion writes go through a single atomic statement — `INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING id` (`apps/web/lib/ingest.ts`) — rather than a separate existence check followed by an insert. Whether a row comes back on the `RETURNING` clause tells the caller whether this was a new reading or an already-seen duplicate, with no race window between the check and the write.
- No separate `IdempotencyRecord` table. The spec's Section 13 sketch includes one, but once `event_id` is already a unique-constrained column being conflict-checked on every write, a side table would just be a slower way to answer "have I seen this ID" — the mechanism the spec is really asking for is the unique constraint, not a specific table shape.

## Consequences

- Idempotency is enforced at the database level, not in application code that could drift or be bypassed by a second ingestion path. Any future writer (a Lambda processor in Phase 3, a batch backfill job) gets the same guarantee for free by using the same `INSERT ... ON CONFLICT`.
- The ingestion API reports `persisted` vs. `duplicates` in its response (`rowCount` from the `RETURNING` clause in `ingest.ts`) specifically so this behavior is visible and testable, not just structurally true.
- This does not yet cover *out-of-order* delivery semantics (a duplicate arriving with a slightly different payload for the same `eventId`) — `DO NOTHING` means the first write wins unconditionally. That's the right call for replayed historical data (a given reading's value never legitimately changes), and is flagged here in case a live-sensor source ever needs last-write-wins or a version check instead.
