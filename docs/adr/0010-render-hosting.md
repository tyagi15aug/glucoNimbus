# ADR 0010: Render as the public deployment target (supersedes ADR 0009)

## Context

ADR 0009 set Cloudflare Workers as the deployment target. Getting there required a second worker implementation (`apps/workers-cf`, Cloudflare Queues instead of SQS), a required Postgres shim (Hyperdrive), a blocked dependency (R2 disabled on the account), and a beta migration path for `apps/web` (vinext, Vite/ESM build, different binding-access pattern). That's the hosting choice dictating the application's architecture — backwards for a portfolio project whose point is the application, not the hosting platform.

## Decision

Deploy to Render instead. Render runs ordinary containers and Node processes, so `apps/web` and `apps/workers` deploy as their existing, already-tested code — no binding rewrite, no beta build target.

- **`apps/web`** — Render web service, Node runtime, `next build` / `next start` unchanged.
- **LocalStack** — its own Render service, running the exact same image + `infrastructure/localstack/init/` seeding as `docker-compose.yml` already does locally (wrapped in `infrastructure/localstack/Dockerfile` since Render can't bind-mount repo files into a plain `image:`-based service the way Compose can). `packages/cloud`'s `aws-sdk` client code doesn't change at all — same endpoint-override pattern, just a different hostname.
- **Postgres** — Render's managed Postgres. Same `pg` driver, different connection string.
- **`apps/workers`** — deferred from the initial deploy. See "What's deferred" below.

## Free-tier constraints (verified against Render's docs, not assumed)

Render's Free instance type supports **web services, static sites, Postgres, and Key Value only.** Private services and Background Worker services are not available on Free at all — they require a paid Starter instance (~$7/mo as of this writing). This matters for two choices here:

1. **LocalStack runs as `type: web`, not `pserv`.** A private service would be free-tier-incompatible. Running it as a plain web service gives it a public URL as a side effect, which is an acceptable trade-off — it holds no real credentials, only fake AWS test resources (`test`/`test` keys, per `.env.example`).
2. **`apps/workers` is deferred, not included in `render.yaml`.** It's a Background Worker by nature (long-polls SQS, no HTTP port) and Render's cheapest instance for that type costs money. Rather than silently paying for it, this is left as an explicit decision for whoever's paying the bill — see the commented-out block in `render.yaml`.

## What's deferred without `apps/workers`

`POST /api/readings` still validates and publishes to SQS (LocalStack) successfully — that part of the pipeline is real. Without a worker consuming the queue, messages just sit there until either a worker is deployed (paid) or `db:migrate`/`db:seed`-provided rows are what the dashboard shows. This is a known, accepted gap for the initial "UI + API working" deployment milestone, not an oversight.

## Cold starts

Free web services (this app and LocalStack both) spin down after 15 minutes idle and cold-start (~1 minute) on the next request. Accepted, not engineered around — see the Master Plan's hosting section and this project's progress doc, Session 6, for the launch/status-screen plan that makes this visible instead of silent.

## Consequences

- `apps/workers-cf` and the Cloudflare-facing scaffold from ADR 0009 have no path forward and should eventually be removed (not done in this pass — see the progress doc's Session 5/7 cleanup list).
- Real AWS deployment (swapping LocalStack for actual SQS/S3) remains a documented future option, not required — consistent with the Master Plan's hosting strategy.
- Adding `apps/workers` later is additive: uncomment the block in `render.yaml`, decide on the Starter cost, done — no code changes needed since it already reads the same env vars as `apps/web`.
