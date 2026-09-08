/**
 * Runs against a real local Postgres — no mocking of the DB layer, only
 * of what this sandbox genuinely cannot reach (LocalStack). That's
 * deliberate: docs/adr/0008-event-driven-pipeline.md explains why the
 * worker's business logic (this file) is the one Phase 3 piece that
 * *can* be verified end-to-end here, unlike the SQS send/receive/delete
 * wiring around it in src/index.ts, which needs the user's own machine.
 *
 * Skips entirely (not failing) when DATABASE_URL isn't set, so `npm run
 * test` from a machine without Postgres running doesn't just fail — see
 * `npm run db:up` / docker-compose.yml.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { Pool } from "pg";
import { applySchema, createFailureRule, deleteFailureRule, type FailureRule } from "@gluconimbus/db";
import type { CanonicalGlucoseEvent } from "@gluconimbus/types";
import { processMessage } from "../src/process-message";

for (const file of [".env", ".env.local"]) {
  const path = join(__dirname, "..", file);
  if (existsSync(path)) config({ path, override: true });
}

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("processMessage", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  beforeAll(async () => {
    await applySchema(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  function reading(overrides: Partial<CanonicalGlucoseEvent> = {}): CanonicalGlucoseEvent {
    return {
      eventId: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      deviceId: "test-device",
      participantId: "test-participant",
      timestamp: new Date().toISOString(),
      glucose: 105,
      unit: "mg/dL",
      source: "synthetic",
      ...overrides,
    };
  }

  it("persists a new reading and records a processing_events row", async () => {
    const event = reading();
    const result = await processMessage({ requestId: "req-1", event }, pool);

    expect(result.status).toBe("persisted");

    const row = await pool.query("SELECT * FROM glucose_readings WHERE event_id = $1", [event.eventId]);
    expect(row.rowCount).toBe(1);

    const pe = await pool.query("SELECT status, request_id FROM processing_events WHERE event_id = $1", [
      event.eventId,
    ]);
    expect(pe.rows[0]?.status).toBe("persisted");
    expect(pe.rows[0]?.request_id).toBe("req-1");
  });

  it("is idempotent — the same eventId processed twice reports duplicate the second time", async () => {
    const event = reading();
    const first = await processMessage({ requestId: "req-2a", event }, pool);
    const second = await processMessage({ requestId: "req-2b", event }, pool);

    expect(first.status).toBe("persisted");
    expect(second.status).toBe("duplicate");

    const rows = await pool.query("SELECT id FROM glucose_readings WHERE event_id = $1", [event.eventId]);
    expect(rows.rowCount).toBe(1); // exactly one row despite two processMessage calls
  });

  it("throws and records a failed processing_events row for a malformed event", async () => {
    const badEvent = reading({ glucose: -50 }); // outside the schema's 0-1000 range

    await expect(processMessage({ requestId: "req-3", event: badEvent }, pool)).rejects.toThrow();

    const pe = await pool.query("SELECT status FROM processing_events WHERE request_id = $1", ["req-3"]);
    expect(pe.rows[0]?.status).toBe("failed");
  });

  it("archival degrades to false without throwing when S3/LocalStack is unreachable", async () => {
    // This sandbox has no LocalStack running, so this exercises the real
    // failure path rather than a mock — archiveRawEvent's own try/catch
    // (packages/cloud/src/s3.ts) is what's actually under test here.
    const event = reading();
    const result = await processMessage({ requestId: "req-4", event }, pool);
    const pe = await pool.query("SELECT archived FROM processing_events WHERE event_id = $1", [event.eventId]);

    expect(result.status).toBe("persisted");
    expect(pe.rows[0]?.archived).toBe(false);
  });
});

/**
 * Phase 6 (spec Section 5, docs/adr/0013-failure-injection.md) — real
 * rows in `failure_rules`, same real-Postgres pattern as above. Each test
 * creates the rule it needs and `afterEach` removes it, since a rule left
 * behind would otherwise affect every subsequent test in this file (and
 * in a shared local Postgres, other test files too).
 */
describe.skipIf(!DATABASE_URL)("processing-scope failure injection", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let createdRule: FailureRule | undefined;

  beforeAll(async () => {
    await applySchema(pool);
  });

  afterEach(async () => {
    if (createdRule) {
      await deleteFailureRule(createdRule.id, pool);
      createdRule = undefined;
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  function reading(overrides: Partial<CanonicalGlucoseEvent> = {}): CanonicalGlucoseEvent {
    return {
      eventId: `test-fi-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      deviceId: "test-device",
      participantId: "test-participant",
      timestamp: new Date().toISOString(),
      glucose: 105,
      unit: "mg/dL",
      source: "synthetic",
      ...overrides,
    };
  }

  it("an active 'error' rule throws instead of persisting, and logs why", async () => {
    createdRule = await createFailureRule({ scope: "processing", failureType: "error", probability: 1 }, pool);
    const event = reading();

    await expect(processMessage({ requestId: "req-fi-1", event }, pool)).rejects.toThrow(/Injected failure/);

    const rows = await pool.query("SELECT id FROM glucose_readings WHERE event_id = $1", [event.eventId]);
    expect(rows.rowCount).toBe(0);

    const pe = await pool.query("SELECT status, error FROM processing_events WHERE request_id = $1", ["req-fi-1"]);
    expect(pe.rows[0]?.status).toBe("failed");
    expect(pe.rows[0]?.error).toMatch(/processor failure/);
  });

  it("a 'db_outage' rule fails the same way as 'error', with a distinct message", async () => {
    createdRule = await createFailureRule({ scope: "processing", failureType: "db_outage", probability: 1 }, pool);
    const event = reading();

    await expect(processMessage({ requestId: "req-fi-2", event }, pool)).rejects.toThrow(/Injected failure/);

    const pe = await pool.query("SELECT error FROM processing_events WHERE request_id = $1", ["req-fi-2"]);
    expect(pe.rows[0]?.error).toMatch(/database unavailable/);
  });

  it("a 'delay' rule adds real latency but still persists", async () => {
    createdRule = await createFailureRule(
      { scope: "processing", failureType: "delay", delayMs: 150, probability: 1 },
      pool,
    );
    const event = reading();

    const start = Date.now();
    const result = await processMessage({ requestId: "req-fi-3", event }, pool);
    const elapsedMs = Date.now() - start;

    expect(result.status).toBe("persisted");
    expect(elapsedMs).toBeGreaterThanOrEqual(150);
  });

  it("probability 0 means the rule never fires", async () => {
    createdRule = await createFailureRule({ scope: "processing", failureType: "error", probability: 0 }, pool);
    const event = reading();

    const result = await processMessage({ requestId: "req-fi-4", event }, pool);
    expect(result.status).toBe("persisted");
  });

  it("an 'ingestion'-scope rule has no effect on processing", async () => {
    createdRule = await createFailureRule({ scope: "ingestion", failureType: "error", probability: 1 }, pool);
    const event = reading();

    const result = await processMessage({ requestId: "req-fi-5", event }, pool);
    expect(result.status).toBe("persisted");
  });
});
