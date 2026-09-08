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

/**
 * Phase 4 auth. `email` is lowercased+trimmed here (not just at the DB
 * layer) so validation errors and the unique-constraint check agree on
 * the same normalized value. Password floor is deliberately low (8 chars)
 * — this is a portfolio demo, not a production account system; documented
 * in docs/adr/0012-auth.md rather than silently over-engineered.
 */
export const registerRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email(),
  password: z.string().min(8).max(200),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;
