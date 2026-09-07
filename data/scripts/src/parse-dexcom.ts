/**
 * Parses a Dexcom Clarity export (see data/README.md for the file's
 * quirks) into the canonical event schema and writes newline-delimited
 * JSON — one CanonicalGlucoseEvent per line — to data/normalized/<id>/glucose.ndjson.
 *
 * This is intentionally a one-time offline transform, run before the
 * simulator ever starts. The simulator replays already-normalized data; it
 * has no knowledge of the Dexcom CSV shape at all (Section 4 of the
 * project spec: the rest of the system should not know the source
 * dataset's schema).
 *
 * Usage: tsx src/parse-dexcom.ts <participantId> [participantId ...]
 */
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "csv-parse";
import type { CanonicalGlucoseEvent } from "@glucostream/types";
import { canonicalGlucoseEventSchema } from "@glucostream/validation";
import { deriveEventId } from "./canonical-id";

const DATA_DIR = join(__dirname, "..", "..");

interface DexcomRow {
  Index: string;
  "Timestamp (YYYY-MM-DDThh:mm:ss)": string;
  "Event Type": string;
  "Event Subtype": string;
  "Patient Info": string;
  "Device Info": string;
  "Source Device ID": string;
  "Glucose Value (mg/dL)": string;
  "Insulin Value (u)": string;
  "Carb Value (grams)": string;
  "Duration (hh:mm:ss)": string;
  "Glucose Rate of Change (mg/dL/min)": string;
  "Transmitter Time (Long Integer)": string;
}

function toIsoUtc(dexcomTimestamp: string): string {
  // Dexcom exports "YYYY-MM-DD HH:mm:ss" with no timezone. We treat it as
  // UTC — a documented simplification (data/README.md), not a claim about
  // the participant's real local time.
  return `${dexcomTimestamp.replace(" ", "T")}Z`;
}

async function parseParticipant(participantId: string): Promise<void> {
  const rawPath = join(DATA_DIR, "raw", participantId, `Dexcom_${participantId}.csv`);
  const outDir = join(DATA_DIR, "normalized", participantId);
  const outPath = join(outDir, "glucose.ndjson");
  mkdirSync(dirname(outPath), { recursive: true });

  const deviceId = `demo-cgm-${participantId}`;
  const events: CanonicalGlucoseEvent[] = [];
  let totalRows = 0;
  let skippedNonEgv = 0;
  let skippedMissingValue = 0;

  const parser = createReadStream(rawPath).pipe(
    parse({ columns: true, skip_empty_lines: true, relax_column_count: true }),
  );

  for await (const row of parser as AsyncIterable<DexcomRow>) {
    totalRows += 1;

    if (row["Event Type"] !== "EGV") {
      skippedNonEgv += 1;
      continue;
    }

    const rawValue = row["Glucose Value (mg/dL)"];
    if (!rawValue) {
      skippedMissingValue += 1;
      continue;
    }

    const timestamp = toIsoUtc(row["Timestamp (YYYY-MM-DDThh:mm:ss)"]);
    const glucose = Number(rawValue);

    const candidate = {
      eventId: deriveEventId(deviceId, participantId, timestamp),
      deviceId,
      participantId,
      timestamp,
      glucose,
      unit: "mg/dL" as const,
      source: "research-replay" as const,
    };

    events.push(canonicalGlucoseEventSchema.parse(candidate));
  }

  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  writeFileSync(outPath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");

  console.log(
    `[${participantId}] ${totalRows} rows -> ${events.length} EGV readings ` +
      `(skipped ${skippedNonEgv} non-EGV, ${skippedMissingValue} EGV rows missing a value) -> ${outPath}`,
  );
}

async function main(): Promise<void> {
  const participantIds = process.argv.slice(2);
  if (participantIds.length === 0) {
    console.error("Usage: tsx src/parse-dexcom.ts <participantId> [participantId ...]");
    process.exit(1);
  }
  for (const id of participantIds) {
    await parseParticipant(id);
  }
}

void main();
