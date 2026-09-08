/**
 * Password hashing only. Split out of lib/jwt.ts so that module stays
 * bcryptjs-free and Edge-safe (see its header comment) — this file is
 * only ever imported from Node-runtime route handlers.
 */
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
