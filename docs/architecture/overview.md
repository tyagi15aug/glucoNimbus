# Architecture Overview

## The event-driven pipeline (as of Phase 3)

```text
PhysioNet (BIG IDEAs Lab dataset)
        │  data/scripts/download-dataset.sh
        ▼
Dexcom_<id>.csv, Food_Log_<id>.csv   (data/raw/, gitignored)
        │  data/scripts/parse-dexcom.ts, parse-food-log.ts
        ▼
glucose.ndjson, meals.ndjson         (data/normalized/, canonical events)
        │
        ├──────────────────────────────┐
        ▼                              ▼
CGM Simulator (apps/simulator)   npm run db:seed (meals only)
  replays at 1x/10x/100x/live          │
  --duplicate-rate / --drop-rate       ▼
  --delay-ms failure injection    Postgres: meal_events
        │  HTTP POST
        ▼
POST /api/readings (apps/web)
        │  validate (zod) → publish, nothing written here directly
        ▼
   SQS: gluconimbus-ingest ──(3 failed attempts)──► gluconimbus-ingest-dlq
        │  long-poll
        ▼
apps/workers: processMessage()
        │
        ├── best-effort archive ──────► LocalStack S3 (gluconimbus-raw)
        │
        ├── upsert(eventId) ──────────► Postgres: glucose_readings
        │
        └── audit row ────────────────► Postgres: processing_events
                                              │
        ┌─────────────────────────┬──────────┼─────────────────────────┐
        ▼                         ▼          ▼                         ▼
GET /api/readings   GET /api/readings/latest  GET /api/analytics/daily  GET /api/processing-events
        │                         │          │                         │
        └─────────────────────────┴──────────┴─────────────────────────┘
                                              ▼
                                  LiveDashboard (apps/web, polls every 5s)
                                              │
                                              ▼
                                     /dashboard — glucose chart,
                                     current reading, trend, daily stats
```

`apps/web` (producer + reader) and `apps/workers` (consumer + writer) are two separate long-running processes now, sharing `packages/db` (Postgres access) and `packages/cloud` (S3 + SQS clients) rather than each owning its own copy — see `docs/adr/0008-event-driven-pipeline.md`.

## Status against the spec's phase roadmap (Section 24)

| Phase | Status |
|---|---|
| 0 — Research and architecture | **Done.** Dataset selected + license-verified (ADR 0001), canonical schema defined (ADR 0002), repo scaffolded, ADRs 0001–0008 written. |
| 1 — Full-stack foundation | **Done** for the MVP slice: Next.js/TypeScript/Turborepo, Postgres, basic dashboard, normalized data model. |
| 2 — CGM simulator | **Done**: dataset parser, normalization, replay engine with speed control, ingestion API target. Multi-device/multi-participant replay (running several simulators at once) works by construction (each run is one `--participant`), just not orchestrated by a single command yet. |
| 3 — LocalStack cloud pipeline | **Done, with one substitution.** S3 archival + a real SQS queue (with DLQ and redrive policy) are wired up; a long-running worker process stands in for the "Processing Lambda" rather than a deployed LocalStack Lambda function — see ADR 0008 for why, and what's unverified in this sandbox as a result. API Gateway isn't modeled at all; Next.js route handlers stand in (ADR 0006). |
| 4 — Auth and authorization | **Done.** Credentials + JWT-session auth (`docs/adr/0012-auth.md`): register/login/logout/me routes, bcryptjs password hashing, a `USER < DEVELOPER < ADMIN` role hierarchy, and `middleware.ts` gating the new `/developer` area (Phase 6's future home) by role. Dashboard/analytics stay unauthenticated on purpose — this is a portfolio demo. |
| 5 — Analytics | **Partial.** Daily average/min/max/stddev/CV, a seven-day historical comparison, and meal context are available through `/api/analytics/daily`, `/api/analytics/trends`, and `/api/events`; the dashboard renders each. Activity and heart-rate correlation remain deferred because the wearable source data is not ingested. |
| 6 — Reliability | **Done.** Idempotency (ADR 0003), simulator-side duplicate/drop/delay injection, and SQS's own retry/DLQ semantics (ADR 0008), plus backend-side developer-toggled failure injection (`docs/adr/0013-failure-injection.md`): the `failure_rules` table is now live, enforced at both the ingestion (`POST /api/readings`) and processing (`packages/ingestion`) boundaries, with a `/developer` control panel to create/remove rules and watch `processing_events` react in real time. |
| 7 — Testing | **Done.** `apps/workers/test/process-message.test.ts` (9 tests) and `apps/web/test/auth.test.ts` (7 tests) cover core logic against a real Postgres; `apps/web/e2e/` (Playwright, 25 tests) adds HTTP-level API integration tests for every route that matters (auth, failure-rules, readings) and browser E2E for the dashboard, the auth UI flow, and the `/developer` role gate — run against a production build, not `next dev`, so the suite doubles as build verification. |
| 8 — Observability and performance | **Partial.** `processing_events` table + `GET /api/processing-events` give a real audit trail of every message the worker handled, plus structured JSON request logs on both `apps/web` and `apps/workers`. The dashboard also displays API, database, and LocalStack readiness via `/api/health`. Queue-depth/latency instrumentation, load testing, and Core Web Vitals work remain deferred. |
| 9 — CI/CD and IaC | **Done, with one deliberate scope cut.** GitHub Actions (`.github/workflows/ci.yml`) runs lint/typecheck/unit tests/build/Playwright E2E against a real Postgres service container on every push/PR, plus the Shared CI Contract artifacts (`docs/adr/0014-ci-cd.md`). No LocalStack in CI (the suite already tolerates that — see Phase 7's row above) and no new Terraform for the GCP hosting side (ADR 0011's setup stays manual) — both explained in ADR 0014. |
| 10 — Portfolio polish | **Partial.** The live `/architecture` page and dashboard pipeline explorer make the runtime data flow and component state legible, and root-level `ARCHITECTURE.md` / `CONTRIBUTING.md` provide a reviewer-oriented entry point. Screenshots/GIFs and a longer technical write-up remain future polish. |

See `docs/adr/0006-mvp-scope-cuts.md` (as amended) and `docs/adr/0008-event-driven-pipeline.md` for the reasoning behind what's built, what's substituted, and what's still deferred.

## AWS → Azure mapping (spec Section 18)

| AWS (via LocalStack) | Azure equivalent | Used today? |
|---|---|---|
| S3 | Azure Blob Storage | Yes — raw event archival |
| API Gateway | Azure API Management | No — Next.js route handlers stand in for now |
| Lambda | Azure Functions | Partially — `apps/workers` is a worker process standing in for the Processing Lambda (ADR 0008); no Lambda is actually deployed |
| SQS | Azure Service Bus | Yes — `gluconimbus-ingest` + `gluconimbus-ingest-dlq`, with a redrive policy |
| SNS | Azure Service Bus Topics / Event Grid | No |
| CloudWatch | Azure Monitor / Application Insights | No — structured console logs + the `processing_events` table only |
| RDS PostgreSQL | Azure Database for PostgreSQL | Yes (via plain Postgres in Docker, not RDS itself) |
