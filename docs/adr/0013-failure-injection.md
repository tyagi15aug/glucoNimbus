# ADR 0013: Phase 6 — developer-toggled failure injection

## Status

Accepted. Built in Phase 6.

## Context

Spec Section 5's "Reliability demonstration" asks for a developer-facing
mechanism to inject failures — duplicate/delayed/dropped events,
processor failure, database unavailable, queue backlog — and to
demonstrate Failure → Retry → Recovery, using a DLQ where appropriate.
Three of those six examples already existed before this phase:

- **Duplicate/delayed/dropped events** are simulator-side
  (`apps/simulator`'s `--duplicate-rate`/`--drop-rate`/`--delay-ms`,
  Session 3) — they exercise idempotency (ADR 0003) on the way in, before
  a reading ever reaches the ingestion API.
- **Queue backlog** is a structural property of the architecture itself
  (SQS + a worker that only drains on its own schedule, ADR 0011), not
  something that needs a synthetic toggle — pausing the worker or
  sending a burst of readings already produces one.

What was missing, and what the `failure_rules` table (created in Phase 3,
unused until now) was reserved for: **backend-side** failure injection —
a developer flips something on in `/developer` and the *server* starts
failing, without touching the simulator or writing code.

## Decision

**A rule's existence is its state.** `failure_rules` has no `enabled`
column — creating a row activates it, deleting the row deactivates it.
Nothing else in this schema soft-deletes (see `packages/db`'s upsert
functions, `processing_events`), and a toggle-boolean would be one more
piece of state to keep in sync with "the row is there or it isn't" for no
real benefit at this scale.

**Two enforcement points, matching the table's existing `scope` column:**

- **`scope: "ingestion"`**, checked in `POST /api/readings`
  (`apps/web/app/api/readings/route.ts`), before the SQS publish call.
  `failure_type: "error"` returns `500 INJECTED_FAILURE` immediately;
  `"delay"` sleeps `delayMs` first, then proceeds normally.
- **`scope: "processing"`**, checked in `packages/ingestion`'s
  `processReading()` — the one piece of business logic both
  `apps/workers` and `apps/workers-cf` share (ADR 0009) — after
  validation but before archive/persist. `"error"` and `"db_outage"`
  both throw (same contract as an existing validation failure: don't
  catch it, let the caller leave the message on the queue so SQS's own
  retry/redrive-to-DLQ handles it, per ADR 0008 — no new retry code
  anywhere); `"delay"` sleeps before persisting.

**`db_outage` only means anything at `processing` scope.** `POST
/api/readings` never touches Postgres at all post-Phase-3 (it only
validates and publishes) — an ingestion-scope `db_outage` rule would be
silently inert. Rather than accept it and do nothing,
`createFailureRuleRequestSchema` (`packages/validation`) rejects that
combination at creation time with a real validation error, so a
developer finds out immediately, not by wondering why nothing happened.

**Each rule rolls its own `probability` independently, every time.**
Multiple active rules for the same scope all get checked; each is an
independent `Math.random() < rule.probability` roll, not a single
roll shared across rules. This matches how the existing simulator-side
injection already behaves (independent duplicate-rate and drop-rate
rolls per event) and means "50% errors, 20% extra delay, at the same
time" is expressible by just adding two rules instead of needing a
combined-rule concept.

**A `db_outage` rule still writes its `processing_events` audit row.**
Arguably inconsistent with simulating an actually-unavailable database —
but `processing_events` is deliberately treated as always-writable here,
the same way a real production system would put its audit/observability
log in infrastructure separate from the primary datastore precisely so
an outage in one doesn't blind you to the other. Making the injected
failure also take down the audit trail would just make the demonstration
harder to watch happen, for a "realism" this project isn't otherwise
modeling (there's no actual second datastore — `processing_events` lives
in the same Postgres instance as `glucose_readings`).

**Role-checked at the route, not just the page.** `middleware.ts`
(Phase 4, ADR 0012) already blocks navigating to `/developer` without a
`DEVELOPER`+ session, but an API route is reachable directly regardless
of what any page does — `GET/POST /api/failure-rules` and `DELETE
/api/failure-rules/:id` each call `requireRole("DEVELOPER")`
(`apps/web/lib/require-role.ts`) themselves. `401` when there's no
session at all, `403` for a real session lacking the role — lets a
caller (or this ADR's reader) tell "log in" from "wrong account" apart.

**The panel is a shared, global control — not scoped per participant or
per viewer.** A rule created by any `DEVELOPER` session affects the one
live pipeline everyone's simulator/dashboard talks to. Documented
directly on the `/developer` page itself (not just here), so it isn't a
surprise the first time two people are using the demo at once.

## Consequences

- No way to schedule a rule to auto-expire (e.g. "fail for the next 5
  minutes") — a developer has to remember to remove it. A real
  chaos-engineering tool would want that; this one didn't need the
  complexity for what it's demonstrating.
- No audit trail of *who* created/removed a rule, or *when* relative to
  the failures it caused, beyond `failure_rules.created_at` and
  correlating by eye against `processing_events.created_at`. Acceptable
  for a single-shared-demo-environment scale; would not be for a
  multi-tenant one.
- Verified in this sandbox via `packages/ingestion`'s real-Postgres test
  suite (`apps/workers/test/process-message.test.ts` — error, db_outage,
  delay, probability-0, and wrong-scope-has-no-effect cases) and via
  curl against a live `next dev` server for the ingestion-scope path
  (confirms the check runs *before* the SQS publish attempt: an active
  ingestion rule returns `500 INJECTED_FAILURE` where an unreachable
  queue would otherwise return `503 QUEUE_UNAVAILABLE` — removing the
  rule flips it straight back). **Not verified**: an actual live SQS
  round-trip showing a processing-scope `error` rule cause real
  redelivery and eventual DLQ landing — this sandbox has no reachable
  LocalStack/SQS at all (same limitation ADR 0008 already documents), so
  that part of "Failure → Retry → Recovery" is demonstrated at the unit
  level (the throw + the DLQ mechanism both individually verified) but
  not watched happening together end to end here. Needs confirming on
  Anuj's Mac with `docker compose up` running, same as several other
  SQS-dependent items already on that list.
