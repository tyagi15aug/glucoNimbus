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
import { Pool } from "pg";
import type { MealEvent } from "@gluconimbus/types";

async function main(): Promise<void> {
  const participantId = process.argv[2] ?? "001";
  const path = join(__dirname, "..", "..", "..", "data", "normalized", participantId, "meals.ndjson");

  if (!existsSync(path)) {
    console.log(`No meals.ndjson for participant ${participantId} at ${path} — skipping meal seed.`);
    return;
  }

  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const lines = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean);
  let count = 0;

  try {
    for (const line of lines) {
      const meal = JSON.parse(line) as MealEvent;
      await pool.query(
        `INSERT INTO meal_events (event_id, participant_id, "timestamp", description, carbs_grams, calories, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (event_id) DO NOTHING`,
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
      count++;
    }
    console.log(`Seeded ${count} meal events for participant ${participantId}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
