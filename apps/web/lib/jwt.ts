/**
 * Session token signing/verification only — deliberately has zero
 * dependency on bcryptjs (see lib/password.ts) so this module is safe to
 * import from middleware.ts, which runs on the Edge runtime. `jose` is
 * pure Web Crypto, no Node APIs, so it works in both places unchanged.
 *
 * JWT session strategy, no separate sessions table (docs/adr/0012-auth.md)
 * — the token itself is the session; logout just clears the cookie
 * client-side (see docs/adr/0012 for the accepted trade-off: a stolen or
 * still-cached token remains valid until it expires, since there's no
 * server-side revocation list).
 */
import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@gluconimbus/types";

export const SESSION_COOKIE = "gluconimbus_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  sub: string;
  email: string;
  role: UserRole;
}

function secretKey(): Uint8Array {
  const secret = process.env["AUTH_SECRET"];
  if (!secret) {
    throw new Error("AUTH_SECRET is not set — see .env.example. Auth cannot function without it.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(user: { id: string; email: string; role: UserRole }): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

const VALID_ROLES: readonly UserRole[] = ["USER", "DEVELOPER", "ADMIN"];

/** Verifies signature + expiry and shape-checks the payload. Never throws — returns null on anything wrong. */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const { sub, email, role } = payload;
    if (typeof sub !== "string" || typeof email !== "string" || !VALID_ROLES.includes(role as UserRole)) {
      return null;
    }
    return { sub, email, role: role as UserRole };
  } catch {
    return null;
  }
}
