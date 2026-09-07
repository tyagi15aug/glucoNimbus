/**
 * `next dev`/`next build`/`next start` auto-load `.env.local`/`.env` —
 * that's Next's own runtime magic, not something Node gives you for free.
 * These `db/*.ts` scripts run standalone via `tsx`, entirely outside
 * Next's process, so without this they silently saw `DATABASE_URL as
 * undefined` and `pg` failed with an opaque `SASL:
 * SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` instead
 * of a real error — caught on Anuj's actual Mac, not in the sandbox
 * (verification there had `DATABASE_URL` manually exported in the shell,
 * which papered over exactly this gap).
 *
 * Mirrors Next's own precedence: `.env.local` wins over `.env` when both
 * are present.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

const root = join(__dirname, "..");

for (const file of [".env", ".env.local"]) {
  const path = join(root, file);
  if (existsSync(path)) {
    dotenv.config({ path, override: true });
  }
}

if (!process.env["DATABASE_URL"]) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "From the repo root: cp .env.example apps/web/.env.local (then fill in real values if needed), " +
      "or export DATABASE_URL yourself before running this script.",
  );
  process.exit(1);
}
