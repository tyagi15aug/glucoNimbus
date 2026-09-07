import { Pool } from "pg";

// Standard Next.js dev-mode singleton — without this, every hot-reload of
// a route file would open a fresh connection pool until Postgres ran out
// of connections.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ?? new Pool({ connectionString: process.env["DATABASE_URL"] });

if (process.env["NODE_ENV"] !== "production") {
  globalForPg.pgPool = pool;
}

export interface GlucoseReadingRow {
  id: string;
  event_id: string;
  device_id: string;
  participant_id: string;
  timestamp: Date;
  glucose: number;
  unit: string;
  source: string;
  created_at: Date;
}
