import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/jwt";

/**
 * Route protection for the DEVELOPER-only area (Phase 6's failure-injection
 * panel lives under /developer — see docs/adr/0012-auth.md). Runs on the
 * Edge runtime, so this only imports lib/jwt.ts (pure `jose`, no bcryptjs)
 * — see that file's header comment for why the split exists.
 *
 * Everything else (dashboard, analytics, the public marketing page) stays
 * unauthenticated on purpose — this is a portfolio demo, and a recruiter
 * shouldn't need an account to see it work.
 */
const ROLE_RANK = { USER: 0, DEVELOPER: 1, ADMIN: 2 } as const;

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session || ROLE_RANK[session.role] < ROLE_RANK.DEVELOPER) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/developer/:path*"],
};
