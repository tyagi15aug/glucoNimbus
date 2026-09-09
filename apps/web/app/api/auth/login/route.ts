import { NextRequest, NextResponse } from "next/server";
import type { User } from "@gluconimbus/types";
import { loginRequestSchema } from "@gluconimbus/validation";
import { findUserByEmailWithHash } from "@gluconimbus/db";
import { verifyPassword } from "@/lib/password";
import { signSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/jwt";
import { newRequestId } from "@/lib/request-id";
import { errorResponse } from "@/lib/api-error";

/**
 * POST /api/auth/login. Deliberately returns the same
 * INVALID_CREDENTIALS/401 whether the email doesn't exist or the password
 * is wrong — distinguishing the two in the response would let a caller
 * enumerate registered emails.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON.", requestId, false, 400);
  }

  const parsed = loginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_FAILED",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      requestId,
      false,
      422,
    );
  }
  const { email, password } = parsed.data;

  // See register/route.ts's matching comment: everything past this point
  // can throw for reasons unrelated to the submitted credentials (a
  // missing AUTH_SECRET, primarily) — catch it here so the client gets a
  // real JSON error instead of Next's HTML error page.
  try {
    const found = await findUserByEmailWithHash(email);
    if (!found || !(await verifyPassword(password, found.passwordHash))) {
      return errorResponse("INVALID_CREDENTIALS", "Incorrect email or password.", requestId, false, 401);
    }
    // Built explicitly (not a `...rest` destructure) so `passwordHash`
    // never even briefly exists on a variable that gets serialized into
    // the response — one less thing to get wrong later if this route
    // changes.
    const user: User = { id: found.id, email: found.email, role: found.role, createdAt: found.createdAt };

    const token = await signSession(user);
    const response = NextResponse.json({ requestId, user }, { status: 200 });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return response;
  } catch (err) {
    console.error(`[auth/login] ${requestId}:`, err);
    return errorResponse("INTERNAL_ERROR", "Login failed unexpectedly.", requestId, true, 500);
  }
}
