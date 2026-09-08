/**
 * Shared Postgres access for every process in the pipeline that touches
 * the database — today that's `apps/web` (reads + admin scripts) and
 * `apps/workers` (writes). Before this package existed, the pool and the
 * upsert SQL were duplicated in `apps/web/lib/db.ts` /
 * `apps/web/lib/ingest.ts`; Phase 3 needed the same idempotent-upsert
 * logic in a second process, and copy-pasting it was the wrong call.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import type { CanonicalGlucoseEvent, MealEvent } from "@gluconimbus/types";

const globalForPg = globalThis as unknown as { gluconimbusPgPool?: Pool };

/**
 * Shared singleton pool. Guarded the same way `apps/web/lib/db.ts` always
 * guarded it — without this, every Next.js dev-mode hot-reload of a route
 * module would open a fresh pool until Postgres ran out of connections.
 * `apps/workers` has no hot-reload story, but importing the same
 * singleton there is harmless and keeps one code path instead of two.
 */
export const pool: Pool =
  globalForPg.gluconimbusPgPool ?? new Pool({ connectionString: process.env["DATABASE_URL"] });

if (process.env["NODE_ENV"] !== "production") {
  globalForPg.gluconimbusPgPool = pool;
}

/** Escape hatch for tests: a throwaway pool against a different DATABASE_URL. */
export function createPool(connectionString?: string): Pool {
  return new Pool({ connectionString: connectionString ?? process.env["DATABASE_URL"] });
}

function readSchemaSql(): string {
  // Resolved relative to this module's own location (not cwd), so it
  // works whether the caller is apps/web/db/migrate.ts, a workers test,
  // or a future script — all of them sit at different depths in the
  // monorepo. Read lazily rather than at module scope, since most
  // importers (the upsert path in production requests) never need it.
  return readFileSync(join(__dirname, "schema.sql"), "utf-8");
}

/**
 * Applies schema.sql. Idempotent (`CREATE TABLE/INDEX IF NOT EXISTS`
 * throughout) — see docs/adr/0007-plain-pg-over-prisma.md for why this is
 * hand-written SQL rather than a migration DSL.
 */
export async function applySchema(target: Pool = pool): Promise<void> {
  await target.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";'); // gen_random_uuid()
  await target.query(readSchemaSql());
}

export interface UpsertOutcome {
  /** false means the row was already there — the idempotent-duplicate case. */
  persisted: boolean;
}

/**
 * `INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING id` as a single
 * atomic statement — no separate existence check racing the insert.
 * Whether a row comes back tells the caller which case happened. See
 * docs/adr/0003-idempotency.md.
 */
export async function upsertGlucoseReading(
  event: CanonicalGlucoseEvent,
  target: Pool = pool,
): Promise<UpsertOutcome> {
  const result = await target.query(
    `INSERT INTO glucose_readings (event_id, device_id, participant_id, "timestamp", glucose, unit, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`,
    [event.eventId, event.deviceId, event.participantId, event.timestamp, event.glucose, event.unit, event.source],
  );
  return { persisted: (result.rowCount ?? 0) > 0 };
}

export async function upsertMealEvent(meal: MealEvent, target: Pool = pool): Promise<UpsertOutcome> {
  const result = await target.query(
    `INSERT INTO meal_events (event_id, participant_id, "timestamp", description, carbs_grams, calories, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`,
    [
      meal.eventId,
      meal.participantId,
      meal.timestamp,
      meal.description ?? null,
      meal.carbsGrams ?? null,
      meal.calories ?? null,
      meal.source,
    ],
  );
  return { persisted: (result.rowCount ?? 0) > 0 };
}

export interface ProcessingEventInput {
  requestId: string;
  eventId?: string | undefined;
  operation: string;
  status: "persisted" | "duplicate" | "failed";
  error?: string | undefined;
  durationMs: number;
  archived: boolean;
}

/**
 * One row per message the worker handles, success or failure — the
 * Phase 8 observability log (spec Section 16) and the Phase 3
 * `ProcessingEvent` model (spec Section 13) are the same fact, so this is
 * the only place either gets written.
 */
export async function recordProcessingEvent(input: ProcessingEventInput, target: Pool = pool): Promise<void> {
  await target.query(
    `INSERT INTO processing_events (request_id, event_id, operation, status, error, duration_ms, archived)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.requestId,
      input.eventId ?? null,
      input.operation,
      input.status,
      input.error ?? null,
      input.durationMs,
      input.archived,
    ],
  );
}

export interface ProcessingEventRow {
  requestId: string;
  eventId: string | null;
  operation: string;
  status: string;
  error: string | null;
  durationMs: number;
  archived: boolean;
  createdAt: string;
}

export async function listRecentProcessingEvents(limit = 50, target: Pool = pool): Promise<ProcessingEventRow[]> {
  const result = await target.query(
    `SELECT request_id, event_id, operation, status, error, duration_ms, archived, created_at
     FROM processing_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows.map((r) => ({
    requestId: r.request_id as string,
    eventId: (r.event_id as string | null) ?? null,
    operation: r.operation as string,
    status: r.status as string,
    error: (r.error as string | null) ?? null,
    durationMs: r.duration_ms as number,
    archived: r.archived as boolean,
    createdAt: (r.created_at as Date).toISOString(),
  }));
}

export type { Pool } from "pg";

export {
  createUser,
  findUserByEmailWithHash,
  findUserById,
  emailExists,
  type CreateUserInput,
} from "./users";
