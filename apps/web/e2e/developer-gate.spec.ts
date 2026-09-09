import { test, expect } from "@playwright/test";
import { gotoAndWaitReady } from "./support";

const DEMO_EMAIL = "demo@gluconimbus.dev";
const DEMO_PASSWORD = process.env["DEMO_DEVELOPER_PASSWORD"] ?? "gluconimbus-demo-2026";
const PASSWORD = "correcthorsebatterystaple";

/**
 * Browser coverage for middleware.ts's role gate and the Phase 6 panel it
 * protects (docs/adr/0012-auth.md, docs/adr/0013-failure-injection.md).
 * The role-gating logic itself is already covered at the HTTP level
 * (e2e/api/failure-rules.spec.ts) — this is about what a real visitor
 * actually sees: a redirect, not a page, and (for a DEVELOPER) a working
 * form.
 */
test("visiting /developer while signed out redirects to /login with a return path", async ({ page }) => {
  await page.goto("/developer");
  await expect(page).toHaveURL(/\/login\?from=%2Fdeveloper/);
});

test("a USER-role account is redirected away from /developer too — a session alone isn't enough", async ({
  page,
}) => {
  const email = `pw-e2e-userrole-${Date.now()}@example.com`;
  await gotoAndWaitReady(page, "/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/developer");
  await expect(page).toHaveURL(/\/login/);
});

test("a DEVELOPER session reaches /developer and can create + remove a failure rule from the panel", async ({
  page,
}) => {
  await gotoAndWaitReady(page, "/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("link", { name: "Developer" }).click();
  await expect(page).toHaveURL(/\/developer/);
  await expect(page.getByText("Failure injection")).toBeVisible();

  await page.getByLabel("Scope").selectOption("processing");
  await page.getByLabel("Probability (0–1)").fill("0.25");
  await page.getByRole("button", { name: "Add rule" }).click();

  await expect(page.getByText(/processing · error/)).toBeVisible();

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("No active rules — the pipeline is running clean.")).toBeVisible();
});
