import { NextRequest, NextResponse } from "next/server";
import { createFailureRuleRequestSchema } from "@gluconimbus/validation";
import { listFailureRules, createFailureRule } from "@gluconimbus/db";
import { requireRole } from "@/lib/require-role";
import { newRequestId } from "@/lib/request-id";
import { errorResponse } from "@/lib/api-error";

/**
 * GET /api/failure-rules — every active rule, both scopes. DEVELOPER+
 * only, same as everything else under this path (spec Section 5's
 * "developer-facing mechanism"; docs/adr/0013-failure-injection.md).
 */
export async function GET(): Promise<NextResponse> {
  const check = await requireRole("DEVELOPER");
  if (!check.ok) return check.response;

  const requestId = newRequestId();
  const rules = await listFailureRules();
  return NextResponse.json({ requestId, rules });
}

/** POST /api/failure-rules — create+activate a rule (its presence in the table is what makes it active). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const check = await requireRole("DEVELOPER");
  if (!check.ok) return check.response;

  const requestId = newRequestId();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON.", requestId, false, 400);
  }

  const parsed = createFailureRuleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_FAILED",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      requestId,
      false,
      422,
    );
  }

  const rule = await createFailureRule(parsed.data);
  return NextResponse.json({ requestId, rule }, { status: 201 });
}
