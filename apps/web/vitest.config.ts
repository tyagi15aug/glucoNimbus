import { defineConfig } from "vitest/config";

/**
 * Explicit config, added alongside Phase 7's Playwright suite
 * (playwright.config.ts): vitest's own default `include` glob
 * (`**\/*.{test,spec}.ts`) would otherwise also try to run the new
 * e2e/**\/*.spec.ts files as vitest tests — they use @playwright/test's
 * `test`/`expect`, not vitest's, and depend on fixtures (a real browser,
 * a real running server) vitest doesn't provide, so that would fail
 * immediately. Scoping `include` to `test/**` (this package's existing
 * vitest suite, e.g. test/auth.test.ts) and excluding `e2e/**` keeps the
 * two suites — and the two test runners — from colliding.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
