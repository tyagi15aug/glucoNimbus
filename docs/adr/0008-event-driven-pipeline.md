# ADR 0008: The Phase 3 event-driven pipeline is a worker process, not a deployed Lambda

## Context

Spec Section 6 and the Phase 3 milestone (Section 24) call for `API Gateway → Ingestion Lambda → SQS → Processing Lambda → PostgreSQL`. ADR 0006 explicitly deferred this: the MVP slice had `POST /api/readings` write directly to S3 and Postgres, with `packages/cloud` left empty as its future home.

Two ways to build the real thing were considered:

1. **Deploy actual Lambda functions to LocalStack** (`awslocal lambda create-function`, a packaging/zip step, IAM roles, an event-source mapping from SQS to the Lambda). This is the literal architecture the spec names.
2. **A long-running Node worker process** (`apps/workers`) that long-polls the same SQS queue and does the same job a Processing Lambda would.

## Decision

Went with (2): `apps/workers`, not deployed Lambda functions.

The deciding factor is this sandbox's own constraints, stated plainly rather than glossed over: this environment has no reachable LocalStack at all (network egress to Docker Hub / LocalStack images is blocked here, same gap ADR 0004 already documents for S3). That means **neither option could be verified end-to-end in this sandbox** — a Lambda deployment and a worker's SQS wiring are equally unverifiable here. Given that, the choice came down to which one leaves the *most* of Phase 3 actually testable:

- A worker process's core logic (`processMessage()` in `apps/workers/src/process-message.ts`) is a plain async function that takes a parsed message and a `pg.Pool`. It has nothing SQS- or LocalStack-specific in it, so it can be — and is — unit-tested against a real local Postgres (`apps/workers/test/process-message.test.ts`), with only the S3 archival call degrading gracefully to `archived: false` (its own try/catch, exercised for real by the absence of LocalStack here, not mocked).
- A deployed Lambda's handler could theoretically be unit-tested the same way, but the packaging, IAM, and event-source-mapping configuration — the actual "did I wire this up correctly" risk — has zero path to verification in this sandbox. A worker process has no equivalent deployment step to get wrong; `npm run workers` either connects to SQS or it doesn't.
- The architectural property the spec actually cares about — ingestion decoupled from processing via a durable queue, with retry/DLQ semantics owned by the queue rather than application code — holds identically either way. A worker consuming from SQS demonstrates async, queue-decoupled, at-least-once processing exactly as well as a Lambda with an SQS event source does.

The trade-off being made explicit: this is not "the same as Lambda," and a reviewer who knows AWS well will notice. Lambda gives you managed scaling-to-zero and per-invocation billing; a long-running worker process is closer to what you'd actually run for a steady, high-volume stream in practice anyway (this is a legitimate, common alternative to Lambda for SQS consumers, not just a shortcut) — but the honest reason it was picked here is sandbox-testability, not a claim that it's strictly better.

### What SQS still does, unconditionally

`infrastructure/localstack/init/02-create-queues.sh` creates `gluconimbus-ingest` with a redrive policy pointing at `gluconimbus-ingest-dlq` (`maxReceiveCount: 3`). `apps/workers` never deletes a message it failed to process (`processMessage` throws; `src/index.ts`'s catch block logs and leaves the message on the queue) — SQS's own visibility timeout and redrive policy are the entire retry/DLQ story. No custom retry loop, no exponential backoff code, no manual DLQ-write path exists anywhere in this repo. That was true of the plan before this ADR and is unchanged by picking a worker over a Lambda.

## What changed in the repo

- `packages/db` (new): the shared Postgres pool, idempotent upsert functions, and `schema.sql` — moved out of `apps/web/lib/db.ts` / `apps/web/lib/ingest.ts` / `apps/web/db/schema.sql`, since `apps/workers` now needs the exact same upsert logic `apps/web` used to own alone.
- `packages/cloud` (filled in): `s3.ts` moved from `apps/web/lib/s3.ts` unchanged in behavior; `sqs.ts` is new — publish (used by `apps/web`) and receive/delete (used by `apps/workers`).
- `apps/web`'s `POST /api/readings` now validates and calls `publishReadingBatch()` instead of writing to Postgres/S3 directly. Its response shape changed: `{requestId, received, status: "queued"}` instead of `{requestId, received, persisted, duplicates}`, since persistence outcome isn't known at publish time anymore. A `503 QUEUE_UNAVAILABLE` (retryable: true) response was added for when the queue itself can't be reached — verified for real in this sandbox, since there's no LocalStack here for it to succeed against.
- `processing_events` table (new, in `packages/db/src/schema.sql`): one row per message the worker handles — this is both the Phase 3 `ProcessingEvent` model (spec Section 13) and the Phase 8 observability log (spec Section 16) unified into one table, plus a new `GET /api/processing-events` route to read it. `users` and `failure_rules` tables were also added ahead of Phases 4 and 6 (empty, unused by any code yet) so the schema migration for those phases won't need to reshape a table with data already in it.

## What's verified here vs. not

**Verified in this sandbox, against a real local Postgres:**
- `processMessage()`'s full behavior: persists a new reading, reports `duplicate` on a repeat `eventId` without creating a second row, throws (and records a `failed` processing_events row) on a schema-invalid event, and degrades archival to `archived: false` without throwing when S3 is unreachable — all four asserted in `apps/workers/test/process-message.test.ts`, run for real, not mocked.
- `next build` compiles the new route (`/api/processing-events`) and the changed one (`/api/readings`) with no type errors.
- A running `next dev` server: `GET /api/readings` and `GET /api/processing-events` return real data from Postgres; `POST /api/readings` correctly returns `503 QUEUE_UNAVAILABLE` when SQS is unreachable (exactly the condition this sandbox is in) rather than crashing or hanging; `422` validation still works.

**Not verified here — needs confirming on a real machine with Docker/LocalStack:**
- That `infrastructure/localstack/init/02-create-queues.sh` actually runs correctly against real LocalStack and produces the queue/DLQ/redrive-policy relationship it's written to produce.
- That `publishReadingBatch()` and `receiveReadingMessages()`/`deleteReadingMessage()` actually talk to a real SQS-compatible endpoint correctly (message shape, `ReceiptHandle` lifecycle) — the sandbox only exercises their *failure* path (connection refused), never a real send/receive round-trip.
- The end-to-end flow: simulator → `POST /api/readings` → SQS → `apps/workers` → Postgres → dashboard, running all four processes at once.
- The redrive-to-DLQ behavior after 3 real failed delivery attempts.

If any of these behave differently on LocalStack than assumed here, that's the piece to look at first.
