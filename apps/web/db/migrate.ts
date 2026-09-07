/**
 * Applies the shared schema (packages/db/src/schema.sql — single source
 * of truth since Phase 3, now that apps/workers needs the same tables).
 * Idempotent (`IF NOT EXISTS` throughout), so running it against an
 * already-migrated database is a safe no-op.
 */
import "./load-env";
import { applySchema, createPool } from "@gluconimbus/db";

async function main(): Promise<void> {
  const pool = createPool();
  try {
    await applySchema(pool);
    console.log("Schema applied.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
