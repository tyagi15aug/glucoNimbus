import { NextResponse } from "next/server";
import { deleteFailureRule } from "@gluconimbus/db";
import { requireRole } from "@/lib/require-role";
import { newRequestId } from "@/lib/request-id";
import { errorResponse } from "@/lib/api-error";

/** DELETE /api/failure-rules/:id — deactivates a rule by removing it. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const check = await requireRole("DEVELOPER");
  if (!check.ok) return check.response;

  const requestId = newRequestId();
  const { id } = await params;
  const deleted = await deleteFailureRule(id);
  if (!deleted) {
    return errorResponse("NOT_FOUND", `No failure rule with id ${id}.`, requestId, false, 404);
  }
  return NextResponse.json({ requestId, deleted: true });
}
