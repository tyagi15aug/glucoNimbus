/**
 * Loads a normalized participant's meal log into Postgres directly — food
 * logs aren't replayed event-by-event through the ingestion pipeline the
 * way glucose readings are (there's no "live food sensor" story to
 * rehearse), so seeding is the honest way to get them into the dashboard.
 *
 * Usage: npm run db:seed --workspace=@gluconimbus/web -- 001
 */
import "./load-env";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { MealEvent } from "@gluconimbus/types";
import { createPool, upsertMealEvent } from "@gluconimbus/db";

async function main(): Promise<void> {
  const participantId = process.argv[2] ?? "001";
  const path = join(__dirname, "..", "..", "..", "data", "normalized", participantId, "meals.ndjson");

  if (!existsSync(path)) {
    console.log(`No meals.ndjson for participant ${participantId} at ${path} — skipping meal seed.`);
    return;
  }

  const pool = createPool();
  const lines = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean);
  let count = 0;

  try {
    for (const line of lines) {
      const meal = JSON.parse(line) as MealEvent;
      const { persisted } = await upsertMealEvent(meal, pool);
      if (persisted) count++;
    }
    console.log(`Seeded ${count} new meal events for participant ${participantId} (existing ones skipped).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
