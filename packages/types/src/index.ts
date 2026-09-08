/**
 * The canonical sensor-event schema (see docs/adr/0002-canonical-event-schema.md).
 *
 * Every dataset adapter (research-replay today, a live sensor SDK later)
 * normalizes into this shape. Nothing downstream of the ingestion boundary
 * — processing, storage, analytics, the dashboard — knows about the
 * original research-dataset schema at all.
 */

export type GlucoseUnit = "mg/dL" | "mmol/L";

/** Where a canonical event originated. Extend this as new adapters are added. */
export type EventSource = "research-replay" | "synthetic" | "live-sensor";

export interface CanonicalGlucoseEvent {
  /**
   * Stable, globally-unique ID for this exact reading. This is the
   * idempotency key — see docs/adr/0003-idempotency.md. Deterministically
   * derived from (deviceId, participantId, timestamp) for replayed data so
   * re-running the simulator against the same window never creates
   * duplicates on its own; a live sensor would mint one per real reading.
   */
  eventId: string;

  /** Logical CGM device identifier, e.g. "demo-cgm-001". */
  deviceId: string;

  /** Research-participant or demo-user identifier this reading belongs to. */
  participantId: string;

  /** ISO-8601 UTC timestamp of the reading. */
  timestamp: string;

  /** Interstitial glucose value in `unit`. */
  glucose: number;

  unit: GlucoseUnit;

  source: EventSource;
}

/** A contextual meal event, when the source dataset provides one. */
export interface MealEvent {
  eventId: string;
  participantId: string;
  timestamp: string;
  description?: string | undefined;
  carbsGrams?: number | undefined;
  calories?: number | undefined;
  source: EventSource;
}

/** A contextual activity event, when the source dataset provides one. */
export interface ActivityEvent {
  eventId: string;
  participantId: string;
  timestamp: string;
  activityType?: string | undefined;
  durationMinutes?: number | undefined;
  heartRateAvg?: number | undefined;
  source: EventSource;
}

/** Roles for the auth/authorization layer (Phase 4). */
export type UserRole = "USER" | "DEVELOPER" | "ADMIN";

/**
 * The client-facing user shape — deliberately excludes `passwordHash`.
 * Anywhere a user record crosses an API boundary, it's this type, never
 * the raw `packages/db` row.
 */
export interface User {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

/**
 * The application-facing error shape every API route returns on failure —
 * kept consistent so the frontend can make decisions off `retryable` rather
 * than parsing messages.
 */
export interface AppErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    retryable: boolean;
  };
}
