# ADR 0004: LocalStack for AWS-compatible infrastructure

## Context

The spec's core narrative is event-driven ingestion through AWS-shaped infrastructure (S3, and SQS/Lambda in Phase 3), runnable locally and demoable without real AWS credentials or cost.

## Decision

Use LocalStack as the AWS emulator (`docker-compose.yml`), starting with just S3 for the MVP. The ingestion API archives every raw event to `s3://gluconimbus-raw/raw/<participantId>/<eventId>.json` (`apps/web/lib/s3.ts`) as a best-effort side effect alongside the Postgres write — S3 being unreachable never blocks ingestion, it just means that one event doesn't get archived (logged, not thrown).

SQS and Lambda are deliberately **not** stood up yet; Phase 1's ingestion is a direct API-route write. Phase 3 replaces the direct write with the full `API Gateway → Ingestion Lambda → SQS → Processing Lambda → Postgres` pipeline from spec Section 6, at which point the S3 archival step this ADR sets up now becomes the first stage of that pipeline rather than a side effect bolted onto a Next.js route handler.

## Consequences

- `docs/architecture/overview.md`'s AWS→Azure mapping table (spec Section 18) applies to LocalStack's services directly, since LocalStack reproduces the real AWS API surface.
- A hosted/CI environment that can't reach Docker Hub (this project has already hit that limit once, in the CloudLab sibling project — see that repo's phase-1-progress notes) can't run `docker compose up` for LocalStack either. Verify this actually works on a normal machine before treating the pipeline as proven end-to-end — flagged the same way CloudLab flags its own Docker-in-sandbox gap.
