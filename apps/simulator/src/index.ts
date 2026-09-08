/**
 * CGM Simulator — replays normalized historical CGM data through the
 * ingestion API in chronological order, at a configurable speed, then
 * continues with synthetic readings once the historical data runs out.
 *
 * This is a first-class part of the platform (spec Section 5), not a
 * throwaway seed script: historical data exercises the exact same
 * ingestion API a live sensor SDK would call.
 *
 * Usage:
 *   npm run simulator -- --participant=001 --speed=10x
 *   npm run simulator -- --participant=001 --speed=100x --duplicate-rate=0.05 --drop-rate=0.05
 */
import { join } from "node:path";
import type { CanonicalGlucoseEvent } from "@gluconimbus/types";
import { parseArgs, speedMultiplier } from "./args";
import { loadHistoricalReadings } from "./replay";
import { publishReading } from "./http-client";
import { generateSyntheticReadings } from "./synthetic";
import { newStats, renderStatsPanel } from "./stats";

const HISTORICAL_INTERVAL_MS = 5 * 60 * 1000; // Dexcom G6 samples ~every 5 minutes.

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shifts an event's displayed timestamp by a constant offset — the
 * dataset's own dates (PhysioNet data is from ~2020) would otherwise flow
 * straight into Postgres unchanged, and the dashboard's "Today" tiles
 * (GET /api/analytics/daily, no explicit ?date=) filter on the server's
 * real current date, so they'd stay empty even though ingestion is
 * working correctly. `eventId` is untouched — it's derived at parse time
 * from the *original* timestamp (data/scripts/canonical-id.ts), so this
 * has no effect on idempotency: re-running the simulator against the
 * same window still produces the same eventIds no matter what "now" is.
 */
function shiftTimestamp(event: CanonicalGlucoseEvent, offsetMs: number): CanonicalGlucoseEvent {
  return { ...event, timestamp: new Date(new Date(event.timestamp).getTime() + offsetMs).toISOString() };
}

async function sendWithFailureInjection(
  apiUrl: string,
  event: CanonicalGlucoseEvent,
  duplicateRate: number,
  dropRate: number,
  delayMs: number,
  stats: ReturnType<typeof newStats>,
): Promise<void> {
  if (delayMs > 0) await sleep(delayMs);

  if (Math.random() < dropRate) {
    stats.dropped += 1;
    return;
  }

  stats.sent += 1;
  const result = await publishReading(apiUrl, event);
  if (result.ok) stats.successful += 1;
  else stats.failed += 1;

  if (Math.random() < duplicateRate) {
    stats.duplicated += 1;
    stats.sent += 1;
    const dup = await publishReading(apiUrl, event); // same eventId — exercises idempotency end to end
    if (dup.ok) stats.successful += 1;
    else stats.failed += 1;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const multiplier = speedMultiplier(args.speed);
  const deviceId = `demo-cgm-${args.participant}`;
  const dataDir = join(__dirname, args.dataDir);

  console.log(`Loading historical data for participant ${args.participant}...`);
  const historical = await loadHistoricalReadings(dataDir, args.participant);
  if (historical.length === 0) {
    throw new Error(`Participant ${args.participant} has no normalized readings.`);
  }
  console.log(`Loaded ${historical.length} historical readings. Speed: ${args.speed}. Target: ${args.apiUrl}`);

  const stats = newStats();
  let printedAt = Date.now();

  const emit = async (event: CanonicalGlucoseEvent): Promise<void> => {
    await sendWithFailureInjection(args.apiUrl, event, args.duplicateRate, args.dropRate, args.delayMs, stats);
    if (Date.now() - printedAt > 2000) {
      console.clear();
      console.log(renderStatsPanel(args.participant, args.speed, stats));
      printedAt = Date.now();
    }
  };

  const firstReading = historical[0];
  if (!firstReading) return; // unreachable (checked historical.length above), satisfies noUncheckedIndexedAccess
  const offsetMs = Date.now() - new Date(firstReading.timestamp).getTime();

  for (const event of historical) {
    await emit(shiftTimestamp(event, offsetMs));
    await sleep(HISTORICAL_INTERVAL_MS / multiplier);
  }

  console.log("Historical data exhausted — continuing with synthetic readings.");
  const lastReading = historical[historical.length - 1];
  if (!lastReading) return; // unreachable (checked historical.length above), satisfies noUncheckedIndexedAccess

  for (const event of generateSyntheticReadings(deviceId, args.participant, lastReading, HISTORICAL_INTERVAL_MS)) {
    await emit(shiftTimestamp(event, offsetMs));
    await sleep(HISTORICAL_INTERVAL_MS / multiplier);
  }
}

void main();
