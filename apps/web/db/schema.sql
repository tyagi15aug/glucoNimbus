-- GlucoStream schema. Plain SQL rather than an ORM migration DSL (see
-- docs/adr/0007-plain-pg-over-prisma.md) — `CREATE TABLE IF NOT EXISTS` is
-- the whole "migration" for the MVP; a real migration tool is worth
-- adopting the moment this needs to evolve a table with data already in
-- it, not before.

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
