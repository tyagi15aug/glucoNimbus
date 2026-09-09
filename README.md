# GlucoNimbus

A CGM real-time data platform: de-identified research CGM data replayed through an event-driven ingestion pipeline into a live dashboard — a portfolio project demonstrating full-stack and cloud engineering, not a product.

> **This is an engineering demonstration using de-identified research data. It is not a medical device, diagnostic system, or source of medical advice.**

## What's here right now

A working event-driven pipeline: research dataset → parser → canonical event → simulator → ingestion API → **SQS** → worker → Postgres (+ best-effort S3 archival via LocalStack) → live dashboard chart, plus Credentials/JWT auth gating a `/developer` area with a live failure-injection control panel, a Playwright + vitest test suite, and GitHub Actions CI on every push/PR. The dashboard includes daily descriptive statistics, a seven-day historical comparison, meal context, and live infrastructure readiness. See `docs/architecture/overview.md` for the full diagram and an honest status table against the project's phase roadmap, and `docs/adr/0008-event-driven-pipeline.md` / `docs/adr/0012-auth.md` / `docs/adr/0013-failure-injection.md` / `docs/adr/0014-ci-cd.md` for what's actually verified vs. not. Activity/heart-rate correlation and real Terraform for the GCP hosting side (ADR 0014's "IaC" section explains why) are **not built yet**.

## Quickstart

```bash
npm install

# Env vars. Next.js only auto-loads .env.local from apps/web/ itself (not
# the repo root), and apps/workers has no Next.js runtime at all to do
# this automatically either — both load it explicitly (db/load-env.ts,
# apps/workers/src/load-env.ts), but the file still has to exist.
cp .env.example apps/web/.env.local
cp .env.example apps/workers/.env.local

# Postgres + LocalStack (S3 + SQS)
docker compose up -d

# Schema (shared by apps/web and apps/workers — packages/db/src/schema.sql)
npm run db:migrate --workspace=@gluconimbus/web

# Optional: a seeded DEVELOPER-role account, since self-registration
# (below) only ever creates USER-role accounts — see docs/adr/0012-auth.md.
# Prints the generated login (demo@gluconimbus.dev / gluconimbus-demo-2026
# unless overridden via DEMO_DEVELOPER_PASSWORD). Needed to reach /developer.
npm run db:seed-demo-user --workspace=@gluconimbus/web

# Get some real CGM data (open-access dataset, see data/README.md)
./data/scripts/download-dataset.sh 001
npm run parse:dexcom --workspace=@gluconimbus/data-scripts -- 001
npm run parse:food-log --workspace=@gluconimbus/data-scripts -- 001
npm run db:seed --workspace=@gluconimbus/web -- 001

# App (in one terminal)
npm run dev --workspace=@gluconimbus/web
# → http://localhost:3000/dashboard

# Worker (in another terminal) — consumes the SQS queue and does the
# actual persisting; without this, readings publish successfully but
# never show up.
npm run workers

# Replay the data through the real ingestion pipeline (in a third terminal)
npm run simulator -- --participant=001 --speed=10x
```

Try the reliability story: `npm run simulator -- --participant=001 --speed=100x --duplicate-rate=0.1 --drop-rate=0.05` — duplicate events collapse to one row (ADR 0003), dropped events just don't show up, and both the simulator's terminal panel and `GET /api/processing-events` report what actually happened to each one.

## Repository structure

Turborepo monorepo (ADR 0005 explains why this project uses one repo where the sibling CloudLab project uses two):

```text
apps/
  web/         Next.js dashboard + API routes (ingestion publish, readings, analytics, processing-events)
  workers/     SQS consumer — the actual persist step (docs/adr/0008)
  workers-cf/  Cloudflare Queues consumer — public-deployment counterpart to apps/workers (ADR 0009, scaffolded, not yet deployed)
  simulator/   CGM replay engine / CLI
packages/
  types/       Canonical event schema (TypeScript)
  validation/  Canonical event schema (zod, runtime)
  db/          Shared Postgres pool, idempotent upserts, schema.sql
  cloud/       S3 + SQS clients (the provider-abstraction layer, ADR 0006/0008)
  ingestion/   Runtime-agnostic message processing, shared by apps/workers and apps/workers-cf (ADR 0009)
  analytics/   Shared deterministic glucose-statistics calculations
  ui/          (placeholder — no cross-app components yet)
data/
  scripts/     Dataset download + parse-to-canonical-event scripts
  README.md    Dataset license, format, and parser quirks
docs/
  architecture/  Diagrams + phase-roadmap status
  adr/           Architecture Decision Records
infrastructure/
  localstack/  S3 bucket + SQS queue/DLQ bootstrap
docker-compose.yml   Postgres + LocalStack (S3, SQS)
```

## Documentation

- `docs/architecture/overview.md` — architecture diagram, phase status, AWS→Azure mapping
- `docs/adr/0012-auth.md` — Phase 4 auth: Credentials + JWT sessions, the role model, what's protected and what isn't
- `docs/adr/0010-render-hosting.md` — the current public-deployment plan (Render).
- `docs/adr/0009-cloudflare-deployment.md` — **superseded by ADR-0010.** Kept as a record of the Cloudflare evaluation (`apps/workers-cf` is the leftover scaffold from it, no longer being built out).
- `docs/adr/` — decisions and why (dataset choice, canonical schema, idempotency, LocalStack, monorepo, MVP scope cuts, plain-pg-over-Prisma, the event-driven pipeline)
- `data/README.md` — dataset details, license, Dexcom CSV quirks

## Known limitations

See `docs/adr/0006-mvp-scope-cuts.md` (as amended), `docs/adr/0008-event-driven-pipeline.md`, `docs/adr/0012-auth.md`, `docs/adr/0013-failure-injection.md`, and `docs/adr/0014-ci-cd.md` for the full picture. In short: CI doesn't stand up LocalStack (ADR 0014), no password reset/email verification/login rate limiting, no Terraform for the GCP hosting side, and the Empatica E4 wearable signals (accelerometry/BVP/EDA/HR/IBI/temp) aren't downloaded or used. The SQS wiring itself (queue/DLQ creation, actual send/receive against LocalStack) has not been run against real LocalStack as of this commit — see ADR 0008's verification section.

## Testing

- `npm test` (or `npm run test --workspace=@gluconimbus/web` / `--workspace=@gluconimbus/workers`) — vitest, unit/integration tests against a real local Postgres (`npm run db:migrate` first). Skips automatically, not failing, if `DATABASE_URL` isn't set.
- `npm run test:e2e` — Playwright, HTTP-level API integration tests plus real-browser E2E (`apps/web/e2e/`). Builds and runs a production `next start` on port 3100 rather than `next dev` — see `apps/web/playwright.config.ts`'s comment for why. Needs local Postgres + `apps/web/.env.local` (same as above); LocalStack/SQS being unreachable is fine, several tests specifically assert that degraded path (`503 QUEUE_UNAVAILABLE`).

### Continuous Integration

`.github/workflows/ci.yml` runs the same commands above (lint, typecheck, unit tests, build, then the Playwright suite) on every push and PR to `main`, against a real Postgres service container — see `docs/adr/0014-ci-cd.md` for what it does and doesn't cover.

## Deploying to Render

`render.yaml` is a Render Blueprint covering the "UI + API working" MVP: `apps/web` (dashboard + API routes), LocalStack (S3 + SQS, seeded via `infrastructure/localstack/Dockerfile`), and a managed Postgres database. `apps/workers` is deliberately not included — see `docs/adr/0010-render-hosting.md` for why (short version: Render's free tier doesn't support Background Worker services at all, only web services/static sites/Postgres/Key Value; running the worker means a paid instance, left as your call).

To deploy: Render Dashboard → New → Blueprint → point at this repo. The build step runs `db:migrate` automatically so the schema exists on first deploy.

Without the worker, `POST /api/readings` queues successfully but nothing persists new readings — the dashboard shows whatever `db:migrate`/`db:seed` put there. Cold starts (up to ~1 minute after 15 minutes idle, on both `apps/web` and LocalStack) are expected on the free plan — see the Master Plan's hosting section and ADR 0010.
