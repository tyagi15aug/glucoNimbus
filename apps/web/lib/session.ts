/**
 * Server-side session helpers for Server Components and Route Handlers
 * (uses next/headers — Node runtime only; middleware.ts reads the cookie
 * itself via NextRequest instead, see that file).
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./jwt";

export type { SessionPayload };

/** Reads + verifies the session cookie. Returns null if absent/invalid/expired — never throws. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

const ROLE_RANK: Record<SessionPayload["role"], number> = { USER: 0, DEVELOPER: 1, ADMIN: 2 };

/** DEVELOPER satisfies a USER requirement, ADMIN satisfies both — an ordinary role hierarchy, not a permission set. */
export function hasRole(session: SessionPayload, minimum: SessionPayload["role"]): boolean {
  return ROLE_RANK[session.role] >= ROLE_RANK[minimum];
}
