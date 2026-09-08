import { NextRequest, NextResponse } from "next/server";
import { registerRequestSchema } from "@gluconimbus/validation";
import { createUser, emailExists } from "@gluconimbus/db";
import { hashPassword } from "@/lib/password";
import { signSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/jwt";
import { newRequestId } from "@/lib/request-id";
import { errorResponse } from "@/lib/api-error";

/**
 * POST /api/auth/register — creates a USER-role account and logs them in
 * immediately (sets the session cookie), rather than requiring a separate
 * login call right after. New accounts always get role USER regardless of
 * what's in the request body — DEVELOPER/ADMIN are granted by an existing
 * admin (not built yet; see docs/adr/0012-auth.md) or the db:seed demo
 * account, never through self-registration.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON.", requestId, false, 400);
  }

  const parsed = registerRequestSchema.safeParse(body);
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

  if (await emailExists(email)) {
    return errorResponse("EMAIL_TAKEN", "An account with this email already exists.", requestId, false, 409);
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser({ email, passwordHash, role: "USER" });
  const token = await signSession(user);

  const response = NextResponse.json({ requestId, user }, { status: 201 });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
