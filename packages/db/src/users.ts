/**
 * User persistence for Phase 4 auth. Deliberately separate from
 * src/index.ts's ingestion-pipeline functions — different lifecycle,
 * different caller (apps/web's auth routes only; apps/workers never
 * touches this table).
 */
import type { Pool } from "pg";
import type { User, UserRole } from "@gluconimbus/types";
import { pool } from "./index";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  role?: UserRole;
}

/**
 * Throws on a duplicate email (relies on the `users_email_key` unique
 * constraint rather than a separate existence check first — same
 * check-then-act-race reasoning as the glucose_readings upsert, ADR 0003,
 * even though the failure mode here is "reject" rather than "no-op").
 */
export async function createUser(input: CreateUserInput, target: Pool = pool): Promise<User> {
  const result = await target.query<UserRow>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, $3)
     RETURNING id, email, password_hash, role, created_at`,
    [input.email, input.passwordHash, input.role ?? "USER"],
  );
  const row = result.rows[0];
  if (!row) throw new Error("createUser: insert returned no row");
  return toUser(row);
}

/** Returns the full row (including the hash) — only for password verification during login. */
export async function findUserByEmailWithHash(email: string, target: Pool = pool): Promise<(User & { passwordHash: string }) | undefined> {
  const result = await target.query<UserRow>(
    `SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1`,
    [email],
  );
  const row = result.rows[0];
  return row ? { ...toUser(row), passwordHash: row.password_hash } : undefined;
}

export async function findUserById(id: string, target: Pool = pool): Promise<User | undefined> {
  const result = await target.query<UserRow>(
    `SELECT id, email, password_hash, role, created_at FROM users WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? toUser(row) : undefined;
}

/** True if the given email is already registered — used to return a clean 409 instead of a raw constraint error. */
export async function emailExists(email: string, target: Pool = pool): Promise<boolean> {
  const result = await target.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
  return (result.rowCount ?? 0) > 0;
}
