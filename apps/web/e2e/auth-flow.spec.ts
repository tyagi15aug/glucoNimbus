import { test, expect } from "@playwright/test";
import { gotoAndWaitReady } from "./support";

const PASSWORD = "correcthorsebatterystaple";

function uniqueEmail(tag: string): string {
  return `pw-e2e-${tag}-${Date.now()}@example.com`;
}

/** Same register/login/logout flow the API integration tests
 * (e2e/api/auth.spec.ts) already prove works over raw HTTP — this
 * exercises it through the actual AuthForm UI instead, including the
 * client-side error handling that was the subject of a real bug fix
 * this session (AuthForm.tsx's fetch/parse/navigate error paths). */
test("register through the UI logs the user in and lands on the dashboard", async ({ page }) => {
  const email = uniqueEmail("register");
  await gotoAndWaitReady(page, "/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(email)).toBeVisible(); // nav shows the signed-in email
});

test("a wrong password shows an inline error and stays on the login page", async ({ page }) => {
  const email = uniqueEmail("badpw");
  await gotoAndWaitReady(page, "/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("button", { name: "Log out" }).click();
  await gotoAndWaitReady(page, "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrongpassword123");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
