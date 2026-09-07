# ADR 0002: A canonical event schema decoupled from the source dataset

## Context

The Dexcom Clarity CSV export (data/README.md) is a messy, dataset-specific shape: metadata rows mixed with readings, an `Event Type` discriminator, no timezone on timestamps, columns for insulin/carb/duration fields this project doesn't use. If the ingestion API, the database, and the frontend all understood that shape directly, swapping datasets (or eventually plugging in a real sensor SDK) would mean touching every layer.

## Decision

Define `CanonicalGlucoseEvent` (`packages/types`) as the one shape that crosses the ingestion boundary, and do the Dexcom-specific parsing entirely in `data/scripts/parse-dexcom.ts` — a one-time offline transform that runs before the simulator ever starts. Everything downstream (the ingestion API, Postgres, the dashboard, the simulator's own synthetic-continuation generator) only ever sees `CanonicalGlucoseEvent`.

Key fields and why they're there:

- `eventId` — a deterministic UUIDv5 derived from `(deviceId, participantId, timestamp)` (`data/scripts/src/canonical-id.ts`), not a random one. Same input row always produces the same ID, which is what makes replaying the same window idempotent by construction rather than by a separate dedup lookup (ADR 0003).
- `timestamp` is normalized to an ISO-8601 UTC string. The Dexcom export has no timezone at all; treating it as UTC is a documented simplification (data/README.md), not a claim about the participant's real local time — irrelevant for a replay demo, but worth being honest about.
- `source` (`research-replay` / `synthetic` / `live-sensor`) exists so the dashboard and analytics can eventually distinguish real historical data from the simulator's post-historical random walk, without needing a second schema.

## Consequences

- Adding CGMacros or OhioT1DM later means writing another `data/scripts/parse-*.ts`, not touching the ingestion API, Postgres schema, or frontend.
- The Postgres schema, `packages/validation`'s zod schema, and `packages/types`'s TypeScript type all describe the *same* canonical shape by construction — they're kept in the same set of packages specifically so a field change is a change in two places (type + zod), not four.
