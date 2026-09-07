# ADR 0006: What today's vertical slice deliberately does not include

## Context

Spec Section 25 defines "today's minimum viable milestone" as: research dataset → parser → canonical event → simulator → LocalStack S3 → simple ingestion API → PostgreSQL → Next.js chart. That's a much smaller surface than the full spec (auth, SQS/Lambda, failure injection, observability, CI, Terraform, a second dataset).

## Decision

This vertical slice explicitly stops short of:

- **SQS/Lambda pipeline (Phase 3).** Ingestion today is a Next.js route handler writing directly to S3 (archival) and Postgres. The spec's own Section 25 milestone calls for exactly this — "a simple ingestion API," not the full `API Gateway → Lambda → SQS → Lambda` chain from Section 6. `packages/cloud` exists as an empty workspace member specifically so the provider-abstraction layer (`CloudProvider` interface, mirroring the sibling CloudLab project's own `LocalStackProvider`/`AWSProvider` split) has an obvious home once that pipeline gets built, rather than being bolted onto `apps/web` later.
- **Auth (Phase 4).** No OAuth, no `User`/role models yet — the dashboard is unauthenticated. The schema (`apps/web/db/schema.sql`) deliberately has no `User` table yet rather than a placeholder one, since an auth model designed before there's an auth provider tends to need reshaping anyway.
- **Failure injection beyond the simulator's own `--duplicate-rate`/`--drop-rate`/`--delay-ms` flags (Phase 6/9 developer-controls panel).** The simulator can already exercise idempotency and dropped events end-to-end; a dedicated `/api/dev/failures` control surface (mirroring CloudLab's `FailureInjector`) that can also inject failures on the *ingestion* side (500s, timeouts, DB outage) is future work.
- **Multi-participant device/UI beyond a `?participantId=` query param**, EC2/VPC-equivalents (not applicable to this project), CI/CD, Terraform, and the ADR/README portfolio polish pass — all explicitly later-phase per the spec's own roadmap (Section 24).

## Consequences

The repo's current state is a real, working vertical slice end to end (parser → simulator → API → Postgres → chart), not a scaffold with stubs — but it should not be read as "Phase 1-5 complete" the way the sibling CloudLab project's progress notes describe. Anything not listed as done in `docs/architecture/overview.md`'s status table is genuinely not built yet.
