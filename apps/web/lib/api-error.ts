import { NextResponse } from "next/server";
import type { AppErrorBody } from "@gluconimbus/types";

/** Same error shape as app/api/readings/route.ts's local helper — factored out here so the new auth routes don't each redefine it. */
export function errorResponse(
  code: string,
  message: string,
  requestId: string,
  retryable: boolean,
  status: number,
): NextResponse<AppErrorBody> {
  return NextResponse.json({ error: { code, message, requestId, retryable } }, { status });
}
