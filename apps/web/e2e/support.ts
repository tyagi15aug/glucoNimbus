import type { Page } from "@playwright/test";

/**
 * `next dev` compiles a route's JS bundle on first hit rather than ahead
 * of time, so the very first navigation to a given page in a test run
 * can take noticeably longer to become interactive than Playwright's
 * ordinary DOM-visibility waits account for — a button can be visible
 * and "actionable" before React has actually hydrated and attached its
 * click handler. Waiting for network idle after navigating gives the
 * client bundle time to load and hydrate before interacting with a
 * form. (A production `next build && next start` webServer wouldn't
 * need this — see playwright.config.ts's comment on that tradeoff.)
 */
export async function gotoAndWaitReady(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}
