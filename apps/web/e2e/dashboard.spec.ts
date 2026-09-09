import { test, expect } from "@playwright/test";

/**
 * Smoke coverage for the one page every visitor sees regardless of role —
 * this is the recruiter/portfolio-visitor path, so it stays
 * unauthenticated on purpose (middleware.ts only gates /developer).
 */
test("dashboard loads without authentication and shows the engineering-demo banner", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(/engineering demonstration/i)).toBeVisible();
});

test("the nav shows Log in / Register when signed out", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Developer" })).toHaveCount(0);
});
