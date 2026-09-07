/**
 * Placeholder. `apps/web/app/api/analytics/daily/route.ts` currently
 * computes average/min/max/stddev inline — fine at one call site. Extract
 * here once a second consumer needs the same math (e.g. the simulator's
 * own stats panel, or a `/api/analytics/trends` endpoint), per the "don't
 * abstract before there are two call sites" approach used throughout this
 * repo (see docs/adr/0005-monorepo.md's reasoning for the same instinct).
 */
export {};
