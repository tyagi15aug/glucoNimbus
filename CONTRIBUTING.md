# Contributing to GlucoNimbus

## Prerequisites

- Node.js 20+
- Docker Desktop, for Postgres and LocalStack

## Local workflow

```bash
npm install
cp .env.example apps/web/.env.local
cp .env.example apps/workers/.env.local
docker compose up -d
npm run db:migrate --workspace=@gluconimbus/web
npm run dev --workspace=@gluconimbus/web
npm run workers
```

Use a separate terminal for the simulator after parsing a participant dataset as described in the [README](README.md).

## Before opening a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The full unit and browser suites require a reachable local Postgres database. The Playwright suite also requires its browsers to be installed. Do not treat an unavailable LocalStack service as a successful queue test; verify the worker and DLQ flow when changing SQS behavior.

## Contribution principles

- Keep the canonical event schema independent of source-dataset columns.
- Validate all external API input at the route boundary.
- Preserve database-enforced idempotency for every glucose-reading writer.
- Do not commit research participant data, credentials, or generated local data.
- Do not add diagnostic, clinical, or treatment language to the UI or documentation.
- Add tests for changed behavior and update an ADR when a significant architectural decision changes.

## Commit and review guidance

Keep commits focused and describe observable behavior. For changes to the pipeline, include the affected stage—simulator, ingestion, queue, worker, persistence, analytics, or dashboard—in the pull request description and state how it was verified.
