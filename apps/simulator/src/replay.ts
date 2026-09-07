import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import type { CanonicalGlucoseEvent } from "@glucostream/types";

/** Reads a normalized glucose.ndjson file for one participant, in order (the parser already sorts it, but don't trust that blindly). */
export async function loadHistoricalReadings(
  dataDir: string,
  participantId: string,
): Promise<CanonicalGlucoseEvent[]> {
  const path = join(dataDir, participantId, "glucose.ndjson");
  if (!existsSync(path)) {
    throw new Error(
      `No normalized data for participant "${participantId}" at ${path}.\n` +
        `Run: ./data/scripts/download-dataset.sh ${participantId} && ` +
        `npm run parse:dexcom --workspace=@glucostream/data-scripts -- ${participantId}`,
    );
  }

  const events: CanonicalGlucoseEvent[] = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    events.push(JSON.parse(line) as CanonicalGlucoseEvent);
  }
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return events;
}
