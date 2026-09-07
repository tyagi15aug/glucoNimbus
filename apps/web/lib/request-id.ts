import { randomUUID } from "node:crypto";

/** Short correlation ID for structured logs — Section 16 observability, cheap version. Full request/operation tracing (duration, provider, status) lands in Phase 5 alongside the SQS/Lambda pipeline it's meant to trace. */
export function newRequestId(): string {
  return randomUUID().slice(0, 8);
}
