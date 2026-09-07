import type { CanonicalGlucoseEvent } from "@gluconimbus/types";

/**
 * Continues a glucose stream after the historical dataset runs out, per
 * spec Section 5 ("Generate synthetic readings after historical data
 * ends"). A bounded random walk, not a physiological model — the goal is
 * an unbroken demo stream, not simulated diabetes.
 */
export function* generateSyntheticReadings(
  deviceId: string,
  participantId: string,
  startingFrom: CanonicalGlucoseEvent,
  intervalMs: number,
): Generator<CanonicalGlucoseEvent> {
  let glucose = startingFrom.glucose;
  let timestampMs = new Date(startingFrom.timestamp).getTime();
  let index = 0;

  while (true) {
    timestampMs += intervalMs;
    index += 1;
    const step = (Math.random() - 0.5) * 8; // +/- 4 mg/dL per tick
    glucose = Math.min(300, Math.max(60, glucose + step));

    yield {
      eventId: `${deviceId}:${participantId}:synthetic:${index}:${timestampMs}`,
      deviceId,
      participantId,
      timestamp: new Date(timestampMs).toISOString(),
      glucose: Math.round(glucose),
      unit: "mg/dL",
      source: "synthetic",
    };
  }
}
