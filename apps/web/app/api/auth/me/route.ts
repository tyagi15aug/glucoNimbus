import { NextResponse } from "next/server";
import { findUserById } from "@gluconimbus/db";
import { getSession } from "@/lib/session";
import { newRequestId } from "@/lib/request-id";

/** GET /api/auth/me — the logged-in user, or `user: null` (not a 401) when there's no valid session — this is a status check, not a protected resource. */
export async function GET(): Promise<NextResponse> {
  const requestId = newRequestId();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ requestId, user: null });
  }
  // Re-reads from the DB rather than trusting the JWT's embedded
  // email/role verbatim — those can go stale for the life of the token
  // (7 days) if a role changes or the account is removed; this route is
  // low-traffic (called once per page load), so the extra query is cheap.
  const user = await findUserById(session.sub);
  return NextResponse.json({ requestId, user: user ?? null });
}
