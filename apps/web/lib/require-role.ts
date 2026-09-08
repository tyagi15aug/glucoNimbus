import { NextResponse } from "next/server";
import { getSession, hasRole, type SessionPayload } from "./session";
import { errorResponse } from "./api-error";
import { newRequestId } from "./request-id";

export type RoleCheckResult = { ok: true; session: SessionPayload } | { ok: false; response: NextResponse };

/**
 * Server-side role gate for API routes. `middleware.ts` already blocks
 * page navigation to `/developer`, but that's not a substitute for
 * checking here too (docs/adr/0012-auth.md) — an API route is reachable
 * directly, not just by clicking through the page. `401` when there's no
 * session at all vs `403` for a real-but-insufficient one, so a caller
 * can tell "log in" from "wrong account" apart.
 */
export async function requireRole(minimum: SessionPayload["role"]): Promise<RoleCheckResult> {
  const requestId = newRequestId();
  const session = await getSession();
  if (!session) {
    return { ok: false, response: errorResponse("UNAUTHENTICATED", "Log in required.", requestId, false, 401) };
  }
  if (!hasRole(session, minimum)) {
    return { ok: false, response: errorResponse("FORBIDDEN", `${minimum} role required.`, requestId, false, 403) };
  }
  return { ok: true, session };
}
