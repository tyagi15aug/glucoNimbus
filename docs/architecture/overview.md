# Architecture Overview

## Today's vertical slice (what's actually built)

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
  --delay-ms failure injection    Postgres: MealEvent
        │  HTTP POST
        ▼
POST /api/readings (apps/web)
        │
        ├── best-effort archive ──────► LocalStack S3 (glucostream-raw)
        │
        └── upsert(eventId) ──────────► Postgres: GlucoseReading
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
        GET /api/readings          GET /api/readings/latest   GET /api/analytics/daily
                    │                         │                         │
                    └─────────────────────────┼─────────────────────────┘
                                              ▼
                                  LiveDashboard (apps/web, polls every 5s)
                                              │
                                              ▼
                                     /dashboard — glucose chart,
                                     current reading, trend, daily stats
```

## Status against the spec's phase roadmap (Section 24)

| Phase | Status |
|---|---|
| 0 — Research and architecture | **Done.** Dataset selected + license-verified (ADR 0001), canonical schema defined (ADR 0002), repo scaffolded, ADRs 0001–0006 written. |
| 1 — Full-stack foundation | **Done** for the MVP slice: Next.js/TypeScript/Turborepo, Postgres, basic dashboard, normalized data model. |
| 2 — CGM simulator | **Done**: dataset parser, normalization, replay engine with speed control, ingestion API target. Multi-device/multi-participant replay (running several simulators at once) works by construction (each run is one `--participant`), just not orchestrated by a single command yet. |
| 3 — LocalStack cloud pipeline | **Partial.** S3 archival exists; API Gateway/Lambda/SQS/DLQ do not — ingestion is a direct Next.js route today (ADR 0004, ADR 0006). |
| 4 — Auth and authorization | **Not started.** |
| 5 — Analytics | **Partial.** Daily average/min/max/stddev exist; trends-over-time, meal/activity correlation do not. |
| 6 — Reliability | **Partial.** Idempotency (ADR 0003) and simulator-side duplicate/drop/delay injection exist. No backend-side failure injection (500s, timeouts, DB outage) or a developer control panel yet. |
| 7 — Testing | **Not started** beyond what's implicit in the code. |
| 8 — Observability and performance | **Partial.** Structured JSON request logs on ingestion; no metrics dashboard, load testing, or Core Web Vitals work yet. |
| 9 — CI/CD and IaC | **Not started.** |
| 10 — Portfolio polish | **Not started.** |

See `docs/adr/0006-mvp-scope-cuts.md` for the reasoning behind what's deliberately deferred.

## AWS → Azure mapping (spec Section 18)

| AWS (via LocalStack) | Azure equivalent | Used today? |
|---|---|---|
| S3 | Azure Blob Storage | Yes — raw event archival |
| API Gateway | Azure API Management | No — Next.js route handlers stand in for now |
| Lambda | Azure Functions | No — Phase 3 |
| SQS | Azure Service Bus | No — Phase 3 |
| SNS | Azure Service Bus Topics / Event Grid | No |
| CloudWatch | Azure Monitor / Application Insights | No — structured console logs only |
| RDS PostgreSQL | Azure Database for PostgreSQL | Yes (via plain Postgres in Docker, not RDS itself) |
