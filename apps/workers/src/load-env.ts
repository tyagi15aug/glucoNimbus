/**
 * Same gap and same fix as `apps/web/db/load-env.ts`: nothing outside
 * `next dev/build/start` gets automatic .env loading, and this app has no
 * Next.js runtime at all, so without this DATABASE_URL/AWS_* are silently
 * undefined and pg fails with an opaque SASL error instead of a clear
 * one. Mirrors the same `.env` then `.env.local` precedence.
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
      "From the repo root: cp .env.example apps/workers/.env.local (then fill in real values if needed), " +
      "or export DATABASE_URL yourself before running this script.",
  );
  process.exit(1);
}
