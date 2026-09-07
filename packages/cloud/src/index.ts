/**
 * The provider-abstraction layer earmarked in ADR 0006 and built out in
 * Phase 3 (ADR 0008): the application layer imports S3/SQS access from
 * here instead of touching `@aws-sdk/client-*` directly. There's only
 * ever been one provider (LocalStack) to swap under this, so it's a
 * barrel of functions rather than a `CloudProvider` interface with
 * multiple implementations — that abstraction is worth adding the day a
 * second provider actually shows up, not before.
 */
export { archiveRawEvent } from "./s3";
export { publishReadingBatch, receiveReadingMessages, deleteReadingMessage } from "./sqs";
export type { QueuedReading, ReceivedMessage } from "./sqs";
