/**
 * Applies db/schema.sql. Idempotent (`IF NOT EXISTS` throughout), so
 * running it against an already-migrated database is a safe no-op —
 * that's the entire migration story until the schema needs to evolve a
 * table with real data in it, at which point a real migration tool
 * earns its keep (see docs/adr/0007-plain-pg-over-prisma.md).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const sql = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";'); // gen_random_uuid()
    await pool.query(sql);
    console.log("Schema applied.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
