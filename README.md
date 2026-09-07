# GlucoStream (GlucoNimbus)

A CGM real-time data platform: de-identified research CGM data replayed through an event-driven ingestion pipeline into a live dashboard — a portfolio project demonstrating full-stack and cloud engineering, not a product.

> **This is an engineering demonstration using de-identified research data. It is not a medical device, diagnostic system, or source of medical advice.**

## What's here right now

A working vertical slice: research dataset → parser → canonical event → simulator → ingestion API → Postgres (+ best-effort S3 archival via LocalStack) → live dashboard chart. See `docs/architecture/overview.md` for the full diagram and an honest status table against the project's phase roadmap — most of the spec (auth, the full SQS/Lambda pipeline, failure injection, CI, Terraform) is **not built yet**.

## Quickstart

```bash
npm install

# Postgres + LocalStack
docker compose up -d

# Schema
npm run db:migrate --workspace=@glucostream/web

# Get some real CGM data (open-access dataset, see data/README.md)
./data/scripts/download-dataset.sh 001
npm run parse:dexcom --workspace=@glucostream/data-scripts -- 001
npm run parse:food-log --workspace=@glucostream/data-scripts -- 001
npm run db:seed --workspace=@glucostream/web -- 001

# App
npm run dev --workspace=@glucostream/web
# → http://localhost:3000/dashboard

# In another terminal: replay the data through the real ingestion pipeline
npm run simulator -- --participant=001 --speed=10x
```

Try the reliability story: `npm run simulator -- --participant=001 --speed=100x --duplicate-rate=0.1 --drop-rate=0.05` — duplicate events collapse to one row (ADR 0003), dropped events just don't show up, and the simulator's terminal panel reports all of it.

## Repository structure

Turborepo monorepo (ADR 0005 explains why this project uses one repo where the sibling CloudLab project uses two):

```text
apps/
  web/         Next.js dashboard + API routes (ingestion, readings, analytics)
  simulator/   CGM replay engine / CLI
packages/
  types/       Canonical event schema (TypeScript)
  validation/  Canonical event schema (zod, runtime)
  analytics/   (placeholder — see package README)
  cloud/       (placeholder for the provider-abstraction layer, Phase 3)
  ui/          (placeholder — no cross-app components yet)
data/
  scripts/     Dataset download + parse-to-canonical-event scripts
  README.md    Dataset license, format, and parser quirks
docs/
  architecture/  Diagrams + phase-roadmap status
  adr/           Architecture Decision Records
infrastructure/
  localstack/  S3 bucket bootstrap
docker-compose.yml   Postgres + LocalStack
```

## Documentation

- `docs/architecture/overview.md` — architecture diagram, phase status, AWS→Azure mapping
- `docs/adr/` — decisions and why (dataset choice, canonical schema, idempotency, LocalStack, monorepo, MVP scope cuts)
- `data/README.md` — dataset details, license, Dexcom CSV quirks

## Known limitations

See `docs/adr/0006-mvp-scope-cuts.md` for the full list. In short: no auth yet, ingestion bypasses SQS/Lambda for now, no CI, no automated tests yet, and the Empatica E4 wearable signals (accelerometry/BVP/EDA/HR/IBI/temp) aren't downloaded or used.
