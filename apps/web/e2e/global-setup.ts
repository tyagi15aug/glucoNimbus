import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Ensures the seeded DEVELOPER demo account exists before any test that
 * needs a DEVELOPER session runs (failure-rules API tests, the
 * /developer browser E2E tests). Reuses the same idempotent script the
 * README's manual quickstart already points to (db/seed-demo-user.ts)
 * instead of duplicating its create-if-missing logic here.
 */
export default function globalSetup(): void {
  execSync("npm run db:seed-demo-user", { cwd: path.resolve(__dirname, ".."), stdio: "inherit" });
}
