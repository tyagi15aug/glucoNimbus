# ADR 0005: Single Turborepo monorepo, not separate repos

## Context

The sibling portfolio project (CloudLab / cloud-control-plane) deliberately uses **two separate git repos** (frontend, backend) per an explicit instruction for that project. GlucoStream's own spec (Section 21) sketches a single-repo Turborepo layout (`apps/web`, `apps/simulator`, `apps/workers`, `packages/*`) instead.

## Decision

Follow the spec as written: one repo, Turborepo-managed npm workspaces, `apps/*` + `packages/*` + `data/scripts` as workspace members.

This is a genuine (if small) architectural choice, not just "the spec said so" — the two projects have different shapes that make different repo splits the right call for each:

- CloudLab has two independently-deployable services with different runtimes (Python/FastAPI, React/Vite) and no shared code between them — a monorepo there would mostly be shared tooling config, not shared source.
- GlucoStream's frontend, simulator, and (later) worker processes are all TypeScript and share the canonical schema directly (`packages/types`, `packages/validation`) — the whole point of ADR 0002's canonical-schema decision is that the simulator and the API import the *same* type and the *same* zod schema, which only works cleanly as a workspace dependency inside one repo.

## Consequences

- `npm install` at the repo root resolves every workspace; there's no cross-repo version-pinning problem to manage the way two separate repos would have.
- Turborepo's task graph (`turbo.json`) is what gives `build`/`lint`/`typecheck` correct dependency ordering across packages — `apps/web` depending on `packages/types` having built (or being directly `transpilePackages`-included, as configured in `next.config.mjs`) is a real ordering constraint, not just organization.
