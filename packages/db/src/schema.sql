-- GlucoNimbus schema. Plain SQL rather than an ORM migration DSL (see
-- docs/adr/0007-plain-pg-over-prisma.md) — single source of truth, applied
-- by apps/web/db/migrate.ts. Shared here (not in apps/web) because
-- apps/workers needs the same tables and this is the one place both
-- import from.

CREATE TABLE IF NOT EXISTS glucose_readings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       TEXT NOT NULL UNIQUE,
  device_id      TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  "timestamp"    TIMESTAMPTZ NOT NULL,
  glucose        DOUBLE PRECISION NOT NULL,
  unit           TEXT NOT NULL,
  source         TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS glucose_readings_participant_timestamp_idx
  ON glucose_readings (participant_id, "timestamp");

CREATE TABLE IF NOT EXISTS meal_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       TEXT NOT NULL UNIQUE,
  participant_id TEXT NOT NULL,
  "timestamp"    TIMESTAMPTZ NOT NULL,
  description    TEXT,
  carbs_grams    DOUBLE PRECISION,
  calories       DOUBLE PRECISION,
  source         TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meal_events_participant_timestamp_idx
  ON meal_events (participant_id, "timestamp");

-- Phase 3/8: one row per SQS message the worker processes, whether it
-- succeeds, fails, or is a duplicate. This is both spec Section 13's
-- "ProcessingEvent" model and Section 16's observability log — the same
-- unification the sibling CloudLab project's OperationRecorder uses, for
-- the same reason: a processed message and a logged operation are the
-- same fact, not two systems to keep in sync.
CREATE TABLE IF NOT EXISTS processing_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     TEXT NOT NULL,
  event_id       TEXT,
  operation      TEXT NOT NULL,
  status         TEXT NOT NULL,      -- 'persisted' | 'duplicate' | 'failed'
  error          TEXT,
  duration_ms    INTEGER NOT NULL,
  archived       BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processing_events_created_at_idx
  ON processing_events (created_at DESC);

-- Phase 4: auth. JWT session strategy (no separate sessions table) — see
-- docs/adr/0012-auth.md for why Credentials over OAuth for this project.
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'USER', -- 'USER' | 'DEVELOPER' | 'ADMIN'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 6: developer-configured failure-injection rules, persisted so they
-- survive an ingestion-route restart (unlike CloudLab's in-memory
-- registry) since this project's "process" is really two long-running
-- processes (web + worker) that would otherwise each need their own copy.
CREATE TABLE IF NOT EXISTS failure_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope          TEXT NOT NULL,      -- 'ingestion' | 'processing'
  failure_type   TEXT NOT NULL,      -- 'error' | 'delay' | 'db_outage'
  delay_ms       INTEGER,
  probability    DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
