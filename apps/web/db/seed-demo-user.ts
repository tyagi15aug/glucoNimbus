/**
 * Creates a seeded DEVELOPER-role account so the /developer area is
 * reachable without a manual `INSERT` — self-registration (POST
 * /api/auth/register) always creates USER-role accounts on purpose (see
 * that route's comment), so this is the only way to get a DEVELOPER
 * session today. Idempotent: safe to re-run, no-ops if the account
 * already exists.
 *
 * Usage: npm run db:seed-demo-user --workspace=@gluconimbus/web
 * Override the password with DEMO_DEVELOPER_PASSWORD if you don't want
 * the documented default sitting in the README.
 */
import "./load-env";
import { createPool, createUser, emailExists } from "@gluconimbus/db";
import { hashPassword } from "../lib/password";

const DEMO_EMAIL = "demo@gluconimbus.dev";
const DEMO_PASSWORD = process.env["DEMO_DEVELOPER_PASSWORD"] ?? "gluconimbus-demo-2026";

async function main(): Promise<void> {
  const pool = createPool();
  try {
    if (await emailExists(DEMO_EMAIL, pool)) {
      console.log(`Demo developer account (${DEMO_EMAIL}) already exists — skipping.`);
      return;
    }
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    await createUser({ email: DEMO_EMAIL, passwordHash, role: "DEVELOPER" }, pool);
    console.log(`Created demo developer account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
