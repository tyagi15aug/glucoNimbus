# ADR 0007: Plain `pg` over an ORM

## Context

Prisma was the initial choice for the Postgres layer — a defensible, common choice for a TypeScript full-stack project. Generating its client failed in this sandbox: `prisma generate` needs to download a native query-engine binary from `binaries.prisma.sh`, and this environment's egress policy returns a 403 for that host (the same class of restriction as the Docker Hub block the sibling CloudLab project's `docs` already note — some binary CDNs aren't reachable from a locked-down sandbox even though the npm registry itself is fine).

## Decision

Use the `pg` driver directly, with hand-written SQL (`apps/web/db/schema.sql`) instead of an ORM schema/migration DSL. Two `INSERT`s and three `SELECT`s (the entire query surface of the MVP) don't need a query builder to stay readable, and it sidesteps the binary-download dependency entirely — `pg` is pure JS/WASM-free, so this actually installs and runs anywhere `npm install` does.

This was verified for real, not assumed: Postgres 16 was already available in this sandbox (`apt`), so the schema, the ingestion upsert, and all three API routes were run against a real local database during this session rather than just typechecked.

## Consequences

- No generated client to keep in sync with the schema — `db/schema.sql` and the TypeScript row types in `lib/db.ts` are two things a schema change touches, not three (schema, migration, generated client).
- No auto-generated type safety on query results either — `pool.query()` returns loosely-typed rows, hand-cast where used. Acceptable at this query count; revisit (either a lighter query builder like Kysely, or going back to Prisma once its engine can actually be fetched on a normal machine — this is an environment limitation, not a verdict on Prisma itself) if the query surface grows enough that hand-typing every row becomes its own source of bugs.
- `db/migrate.ts` running raw `schema.sql` with `IF NOT EXISTS` is a fine "migration story" for a schema that's only ever grown additively so far. It is not a real migration tool — no down-migrations, no tracking of which statements have run beyond Postgres's own idempotent DDL guards. Worth revisiting before the schema needs its first breaking change (a column rename, a `NOT NULL` added to a populated table).
