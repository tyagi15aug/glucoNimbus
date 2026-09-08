/**
 * Covers Phase 4 auth end to end at the logic layer: password hashing,
 * JWT sign/verify (including tamper/garbage rejection), and the real
 * register→login DB round trip against Postgres. Same pattern as
 * apps/workers/test/process-message.test.ts — skips (not fails) when
 * DATABASE_URL isn't set, real Postgres otherwise, no mocking of the DB
 * layer.
 *
 * Imports lib/jwt and lib/password by relative path, not the `@/*` alias
 * — this workspace has no vitest config wiring up tsconfig path mapping,
 * and these two modules have no other internal dependencies that would
 * need it either.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { Pool } from "pg";
import { applySchema, createUser, emailExists, findUserByEmailWithHash } from "@gluconimbus/db";
import { hashPassword, verifyPassword } from "../lib/password";
import { signSession, verifySession } from "../lib/jwt";

for (const file of [".env", ".env.local"]) {
  const path = join(__dirname, "..", file);
  if (existsSync(path)) config({ path, override: true });
}

process.env["AUTH_SECRET"] ??= "test-only-secret-not-for-production-use";

describe("password hashing", () => {
  it("verifies a matching password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("never stores the plaintext password in the hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).not.toContain("correct-horse-battery-staple");
  });
});

describe("session tokens", () => {
  const user = { id: "11111111-1111-1111-1111-111111111111", email: "dev@example.com", role: "DEVELOPER" as const };

  it("round-trips a signed session", async () => {
    const token = await signSession(user);
    const payload = await verifySession(token);
    expect(payload).toEqual({ sub: user.id, email: user.email, role: user.role });
  });

  it("rejects a tampered token", async () => {
    const token = await signSession(user);
    const tampered = `${token.slice(0, -2)}xx`;
    expect(await verifySession(tampered)).toBeNull();
  });

  it("rejects garbage input without throwing", async () => {
    expect(await verifySession("not-a-real-jwt")).toBeNull();
  });
});

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("register → login DB round trip", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });

  beforeAll(async () => {
    await applySchema(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  function testEmail(): string {
    return `auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  it("creates a user, finds it by email, and verifies the password", async () => {
    const email = testEmail();
    const passwordHash = await hashPassword("a-real-password");

    expect(await emailExists(email, pool)).toBe(false);

    const created = await createUser({ email, passwordHash, role: "USER" }, pool);
    expect(created.email).toBe(email);
    expect(created.role).toBe("USER");

    expect(await emailExists(email, pool)).toBe(true);

    const found = await findUserByEmailWithHash(email, pool);
    expect(found).toBeDefined();
    expect(await verifyPassword("a-real-password", found!.passwordHash)).toBe(true);
    expect(await verifyPassword("wrong-password", found!.passwordHash)).toBe(false);
  });

  it("enforces unique email at the DB level", async () => {
    const email = testEmail();
    const passwordHash = await hashPassword("whatever");
    await createUser({ email, passwordHash }, pool);
    await expect(createUser({ email, passwordHash }, pool)).rejects.toThrow();
  });
});
