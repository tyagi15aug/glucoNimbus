# GlucoNimbus

A CGM real-time data platform: de-identified research CGM data replayed through an event-driven ingestion pipeline into a live dashboard — a portfolio project demonstrating full-stack and cloud engineering, not a product.

> **This is an engineering demonstration using de-identified research data. It is not a medical device, diagnostic system, or source of medical advice.**

## What's here right now

A working event-driven pipeline: research dataset → parser → canonical event → simulator → ingestion API → **SQS** → worker → Postgres (+ best-effort S3 archival via LocalStack) → live dashboard chart. See `docs/architecture/overview.md` for the full diagram and an honest status table against the project's phase roadmap, and `docs/adr/0008-event-driven-pipeline.md` for what's actually verified vs. not. Auth, analytics beyond daily stats, a failure-injection control panel, CI, and Terraform are **not built yet**.

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
  analytics/   (placeholder — see package README)
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
- `docs/adr/0010-render-hosting.md` — the current public-deployment plan (Render).
- `docs/adr/0009-cloudflare-deployment.md` — **superseded by ADR-0010.** Kept as a record of the Cloudflare evaluation (`apps/workers-cf` is the leftover scaffold from it, no longer being built out).
- `docs/adr/` — decisions and why (dataset choice, canonical schema, idempotency, LocalStack, monorepo, MVP scope cuts, plain-pg-over-Prisma, the event-driven pipeline)
- `data/README.md` — dataset details, license, Dexcom CSV quirks

## Known limitations

See `docs/adr/0006-mvp-scope-cuts.md` (as amended) and `docs/adr/0008-event-driven-pipeline.md` for the full picture. In short: no auth yet, no backend-side failure injection or developer control panel, no CI, only the worker's core logic has automated tests so far (no API-route or E2E tests yet), and the Empatica E4 wearable signals (accelerometry/BVP/EDA/HR/IBI/temp) aren't downloaded or used. The SQS wiring itself (queue/DLQ creation, actual send/receive against LocalStack) has not been run against real LocalStack as of this commit — see ADR 0008's verification section.

## Deploying to Render

`render.yaml` is a Render Blueprint covering the "UI + API working" MVP: `apps/web` (dashboard + API routes), LocalStack (S3 + SQS, seeded via `infrastructure/localstack/Dockerfile`), and a managed Postgres database. `apps/workers` is deliberately not included — see `docs/adr/0010-render-hosting.md` for why (short version: Render's free tier doesn't support Background Worker services at all, only web services/static sites/Postgres/Key Value; running the worker means a paid instance, left as your call).

To deploy: Render Dashboard → New → Blueprint → point at this repo. The build step runs `db:migrate` automatically so the schema exists on first deploy.

Without the worker, `POST /api/readings` queues successfully but nothing persists new readings — the dashboard shows whatever `db:migrate`/`db:seed` put there. Cold starts (up to ~1 minute after 15 minutes idle, on both `apps/web` and LocalStack) are expected on the free plan — see the Master Plan's hosting section and ADR 0010.
