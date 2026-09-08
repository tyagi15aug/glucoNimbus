import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/jwt";
import { newRequestId } from "@/lib/request-id";

/** POST /api/auth/logout — clears the session cookie. No server-side state to revoke (see docs/adr/0012-auth.md). */
export async function POST(): Promise<NextResponse> {
  const requestId = newRequestId();
  const response = NextResponse.json({ requestId, loggedOut: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
