/**
 * Placeholder for the provider-abstraction layer (docs/adr/0006-mvp-scope-cuts.md).
 *
 * Not built yet: `apps/web/lib/s3.ts` talks to LocalStack's S3 API
 * directly today, which is fine for a single provider and one bucket
 * operation. Once Phase 3 adds SQS/Lambda and a real AWS deployment
 * target becomes worth supporting, a `CloudProvider` interface belongs
 * here — mirroring the sibling CloudLab project's own
 * `LocalStackProvider`/`AWSProvider` split — so the application layer
 * stops importing `@aws-sdk/client-s3` directly.
 */
export {};
