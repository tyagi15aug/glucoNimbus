import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Phase 7 (spec's testing roadmap phase — see docs/architecture/overview.md's
 * status table). Runs against a real `next dev` server on a dedicated port
 * (not 3000, so this doesn't collide with a dev server already running) and
 * the same real local Postgres the vitest suites use — same "verify against
 * the real thing, not mocks" convention as
 * apps/workers/test/process-message.test.ts and apps/web/test/auth.test.ts.
 *
 * e2e/api/*.spec.ts are pure HTTP integration tests against the actual
 * route handlers, using Playwright's `request` fixture rather than a
 * browser. That's a deliberate choice, not just a speed one: several
 * routes (anything calling getSession(), via lib/session.ts) use
 * next/headers's cookies(), which only works inside Next's own
 * request-scoped runtime — importing a route handler and invoking it
 * directly (the way a plain vitest unit test would) throws outside that
 * context. Going through real HTTP against a real running server is what
 * makes cookie-based session auth testable at all here.
 *
 * e2e/*.spec.ts (no api/ prefix) are real browser tests.
 *
 * globalSetup seeds the demo DEVELOPER account (idempotent — see
 * db/seed-demo-user.ts) so DEVELOPER-gated tests have a real session to
 * log in with, the same account the README's manual quickstart uses.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // shared Postgres + shared failure_rules state (ADR 0013's "shared, global control") — serial keeps this predictable; not a performance concern at this suite's size
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  // Locally, "line" is enough. In CI (GitHub Actions sets CI automatically),
  // also emit the HTML report so the workflow has something to upload as an
  // artifact — see .github/workflows/ci.yml and docs/adr/0014-ci-cd.md.
  reporter: process.env["CI"] ? [["line"], ["html", { open: "never" }]] : "line",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    // A production build+start, not `next dev`, on purpose: `next dev`
    // compiles each route on first hit rather than ahead of time, which
    // made the very first navigation to a given route in a run
    // (typically /register, then /dashboard right after) take a couple
    // of real seconds — long enough to flake past ordinary assertion
    // timeouts for reasons that have nothing to do with the app itself.
    // Building once up front also means this suite doubles as the
    // production-build verification for whatever changed since the
    // last confirmed build (see docs/adr/0013-failure-injection.md's
    // Consequences section — Phase 6 landed without that confirmation).
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // PLAYWRIGHT_CHROMIUM_PATH is unset by default, so this is a
        // no-op everywhere except environments that set it (this sandbox
        // has a pinned Chromium revision that doesn't match every
        // @playwright/test release's expected download — pointing at it
        // directly avoids fetching a second copy). Elsewhere (Anuj's
        // Mac, CI), leave it unset and run `npx playwright install
        // chromium` once instead.
        launchOptions: process.env["PLAYWRIGHT_CHROMIUM_PATH"]
          ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_PATH"] }
          : {},
      },
    },
  ],
});
