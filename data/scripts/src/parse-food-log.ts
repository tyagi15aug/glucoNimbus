/**
 * Parses a Food_Log_<id>.csv into canonical MealEvents (data/README.md has
 * the raw column layout). Mirrors parse-dexcom.ts's structure deliberately
 * — same shape of transform, different source columns.
 *
 * Usage: tsx src/parse-food-log.ts <participantId> [participantId ...]
 */
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "csv-parse";
import type { MealEvent } from "@glucostream/types";
import { deriveEventId } from "./canonical-id";

const DATA_DIR = join(__dirname, "..", "..");

interface FoodLogRow {
  date: string;
  time: string;
  time_begin: string;
  time_end: string;
  logged_food: string;
  amount: string;
  unit: string;
  searched_food: string;
  calorie: string;
  total_carb: string;
  dietary_fiber: string;
  sugar: string;
  protein: string;
  total_fat: string;
}

function toIsoUtc(date: string, time: string): string {
  return `${date}T${time}Z`;
}

async function parseParticipant(participantId: string): Promise<void> {
  const rawPath = join(DATA_DIR, "raw", participantId, `Food_Log_${participantId}.csv`);
  const outDir = join(DATA_DIR, "normalized", participantId);
  const outPath = join(outDir, "meals.ndjson");
  mkdirSync(dirname(outPath), { recursive: true });

  const events: MealEvent[] = [];
  let totalRows = 0;

  const parser = createReadStream(rawPath).pipe(
    parse({ columns: true, skip_empty_lines: true, relax_column_count: true }),
  );

  for await (const row of parser as AsyncIterable<FoodLogRow>) {
    totalRows += 1;
    if (!row.date || !row.time) continue;

    const timestamp = toIsoUtc(row.date, row.time);
    const carbs = Number(row.total_carb);
    const calories = Number(row.calorie);

    events.push({
      eventId: deriveEventId(`food-log-${participantId}`, participantId, timestamp + row.logged_food),
      participantId,
      timestamp,
      description: row.logged_food || row.searched_food || undefined,
      carbsGrams: Number.isFinite(carbs) ? carbs : undefined,
      calories: Number.isFinite(calories) ? calories : undefined,
      source: "research-replay",
    });
  }

  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  writeFileSync(outPath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  console.log(`[${participantId}] ${totalRows} rows -> ${events.length} meal events -> ${outPath}`);
}

async function main(): Promise<void> {
  const participantIds = process.argv.slice(2);
  if (participantIds.length === 0) {
    console.error("Usage: tsx src/parse-food-log.ts <participantId> [participantId ...]");
    process.exit(1);
  }
  for (const id of participantIds) {
    await parseParticipant(id);
  }
}

void main();
