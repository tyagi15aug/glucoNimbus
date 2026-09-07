# ADR 0011: `apps/workers` runs as a scheduled Cloud Run Job in the hosted demo (revises ADR 0010's deferral)

## Context

ADR 0010 deferred `apps/workers` from the Render deployment because Render's Free instance type has no Background Worker option at all — the cheapest way to keep it always-on there costs ~$7/mo. Oracle Cloud's Always Free tier was explored next specifically because a plain VM has no such service-type restriction (see the Master Plan's hosting section and this project's Session 8), but its Ampere A1 shape turned out to be gated by real-world capacity contention — instance creation fails with "out of capacity" unpredictably, sometimes for days. That's not an acceptable foundation for "the thing that's supposed to just work."

Re-examined the actual requirement: `apps/workers` exists to consume simulated glucose-reading events from SQS (LocalStack) and persist them via Postgres. It's not serving real users or real data — it's demonstrating the event-driven pattern from spec Section 6 for a portfolio audience. Nothing about that requires the worker to be a resident, always-polling process in the *hosted* environment; that resident-process shape is what's forcing every hosting option into either a cost or a capacity problem.

## Decision

Deploy `apps/workers` as a **Google Cloud Run Job**, invoked on a schedule by **Cloud Scheduler**, instead of as an always-on process.

- `src/index.ts` now supports two run modes via `WORKER_MODE` (default `live`):
  - `live` — the original infinite long-poll loop. Unchanged behavior, used by `docker-compose.prod.yml`'s always-on worker if that VM path is ever revived.
  - `once` — drains whatever is currently on the queue (looping `receiveReadingMessages` until a poll comes back empty), then exits. This is what the Cloud Run Job runs.
- The consumption/processing logic (`processMessage`, `deleteReadingMessage`, the DLQ-via-redelivery error handling) is untouched — only the process's run-until-killed vs. run-once-and-exit lifecycle changed.
- Cloud Scheduler triggers an execution every few minutes (see `infrastructure/gcp/README.md` for the exact command and cron expression). Both Cloud Run (job executions) and Cloud Scheduler (this app needs exactly 1 of the 3 free jobs/month) are covered by Google Cloud's Always Free tier for this usage pattern, with no capacity lottery — Cloud Run is ordinary request/invocation-driven infrastructure, not scarce reserved capacity like Oracle's A1.Flex shape.
- **Postgres also moves off Render's free tier to [Neon](https://neon.tech)** in this same pass — not because of anything to do with the worker, but because Render's free Postgres expires after 30 days and Neon's is free indefinitely. This is a connection-string swap only; both speak standard Postgres wire protocol, so `packages/db` doesn't change.

## Consequences

- **Processing is no longer real-time.** Readings sit on the queue for up to one scheduler interval before being consumed. Accepted: the data is simulated, and this was never a live-user-facing guarantee.
- `apps/workers` stays in the repo as a normal long-running-process package (`npm run dev` for local work still uses `live` mode, unchanged) — the separate-service architecture remains visible to anyone reading the code, even though the hosted deployment runs it as scheduled batches.
- This is a genuine, if modest, behavior change driven by hosting economics rather than the reverse — worth being explicit about, per the Master Plan's rule that hosting shouldn't force architectural changes. The mitigating factor: the change is a run-mode flag, not a rewrite, and the "live" path still exists and still works.
- Adds a second cloud account (Google Cloud) alongside Render and Neon. `docker-compose.prod.yml` / the Oracle VM path is shelved, not deleted — if Oracle capacity or a different VM ever becomes viable, `apps/workers` can go back to `live` mode there with no code change.
