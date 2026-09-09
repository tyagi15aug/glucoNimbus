# GlucoNimbus Architecture

GlucoNimbus is a portfolio-scale, event-driven CGM-data demonstration. It replays de-identified research readings as simulated sensor telemetry; it does not provide medical advice, diagnosis, or device functionality.

## Reading lifecycle

```text
Research CSV
  │ parse + canonicalize
  ▼
Canonical NDJSON ──► Simulator CLI ──► POST /api/readings
                                             │ validate + enqueue (202 Accepted)
                                             ▼
                                      LocalStack SQS ingest queue
                                             │ long-poll + retry / DLQ
                                             ▼
                                      Processing worker
                                     ┌────────┼──────────┐
                                     ▼        ▼          ▼
                              raw S3 archive  Postgres  processing audit
                                                   │
                                                   ▼
                                  analytics / readings / system-status APIs
                                                   │
                                                   ▼
                                           Next.js dashboard
```

The dashboard's **How this reading moves through GlucoNimbus** panel is a live counterpart to this diagram. It obtains queue state from LocalStack, database readiness from Postgres, and worker activity from the processing audit table. A status of `idle` is deliberately different from a health assertion: it means no recent observed activity.

## Responsibilities

| Component | Responsibility |
|---|---|
| Data scripts | Convert the source dataset into stable canonical glucose and meal events. |
| Simulator | Replays a participant chronologically and can inject duplicate, delayed, or dropped events. |
| Ingestion API | Validates external input and publishes it to SQS; it does not persist glucose readings itself. |
| SQS | Decouples ingestion from persistence and provides at-least-once delivery, visibility timeout, retry, and DLQ behavior. |
| Worker | Archives raw messages best-effort, applies failure rules, performs an idempotent Postgres upsert, and writes an audit row. |
| Postgres | Holds readings, meal context, users, failure rules, and processing events. `event_id` is unique, making duplicate persistence impossible at the database boundary. |
| Web app | Presents latest readings, deterministic analytics, contextual meals, system state, and developer diagnostics. |

## Request and failure behavior

- The ingestion API returns `202 Accepted` only after SQS accepts a valid event. A `202` does not imply it has been persisted yet.
- The worker uses `INSERT ... ON CONFLICT (event_id) DO NOTHING`; duplicate deliveries become audit events, not duplicate glucose readings.
- Processing failures leave the SQS message unacknowledged. SQS retries it according to its redrive policy and eventually moves it to the DLQ.
- Developer-only failure rules can inject ingestion or processing errors, delay, and database outages to demonstrate recovery behavior.

## Deployment shapes

Local development uses Docker Compose for Postgres and LocalStack, with the web server and worker as separate Node processes. `render.yaml` describes the public web/API, Postgres, and LocalStack services. Its free-tier configuration deliberately omits the long-running worker; see [ADR 0010](docs/adr/0010-render-hosting.md) for that trade-off.

## Architectural boundaries

- `packages/types` defines the canonical event contract.
- `packages/validation` validates untrusted API input.
- `packages/cloud` owns SQS and S3 adapters.
- `packages/db` owns database access and idempotency SQL.
- `packages/ingestion` contains runtime-neutral processing logic used by consumers.

This separation keeps the domain flow independent of the original research dataset and prevents web routes and workers from duplicating infrastructure behavior.

## Decisions and known limits

The architecture decisions are recorded in [docs/adr](docs/adr/). The main intentional substitutions are Next.js route handlers for API Gateway and a Node worker for a deployed Lambda. LocalStack queue/S3 behavior should be verified in a running Docker environment before claiming a complete cloud integration test. Activity/heart-rate context, full queue latency metrics, and a continuously hosted worker are future work.
