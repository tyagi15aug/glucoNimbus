import { z } from "zod";

/**
 * Runtime validation for everything crossing the ingestion boundary.
 * `CanonicalGlucoseEvent` (packages/types) is the compile-time contract;
 * this is what actually guards the API route against a malformed simulator
 * payload or a future untrusted client.
 */
export const glucoseUnitSchema = z.enum(["mg/dL", "mmol/L"]);

export const eventSourceSchema = z.enum(["research-replay", "synthetic", "live-sensor"]);

export const canonicalGlucoseEventSchema = z.object({
  eventId: z.string().min(1),
  deviceId: z.string().min(1),
  participantId: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
  // Dexcom G6 reports 40-400 mg/dL; a little headroom either side catches
  // sensor warm-up/error codes in the source data without accepting garbage.
  glucose: z.number().min(0).max(1000),
  unit: glucoseUnitSchema,
  source: eventSourceSchema,
});

export type CanonicalGlucoseEventInput = z.infer<typeof canonicalGlucoseEventSchema>;

/** Ingestion API accepts either one reading or a batch (the simulator sends batches). */
export const ingestReadingsRequestSchema = z.union([
  canonicalGlucoseEventSchema,
  z.array(canonicalGlucoseEventSchema).min(1).max(500),
]);

export function normalizeIngestRequest(
  parsed: z.infer<typeof ingestReadingsRequestSchema>,
): CanonicalGlucoseEventInput[] {
  return Array.isArray(parsed) ? parsed : [parsed];
}
