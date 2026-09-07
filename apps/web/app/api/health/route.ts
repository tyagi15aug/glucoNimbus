import { NextResponse } from "next/server";
import { pool } from "@gluconimbus/db";

type ComponentStatus = "ready" | "unreachable";

interface HealthResponse {
  api: "ready";
  postgres: ComponentStatus;
  localstack: ComponentStatus;
  overall: "ready" | "starting";
}

/**
 * GET /api/health — aggregate readiness, not just "the Next.js process
 * responded." Render's free web services (this app and LocalStack both)
 * spin down when idle and cold-start on the next request, so the app
 * itself can be up before Postgres or LocalStack have finished waking —
 * a bare liveness check would report "ok" while POST /api/readings still
 * 503s. See the Master Plan's hosting section (cold-start UX) and this
 * project's progress doc, Session 6.
 *
 * This is the same data a future System Status dashboard screen needs —
 * meant to be reused there, not duplicated (Session 6).
 */
export async function GET(): Promise<NextResponse<HealthResponse>> {
  let postgres: ComponentStatus = "unreachable";
  try {
    await pool.query("SELECT 1");
    postgres = "ready";
  } catch (err) {
    console.error("[health] postgres check failed:", err);
  }

  let localstack: ComponentStatus = "unreachable";
  try {
    const endpoint = (process.env["AWS_ENDPOINT_URL"] ?? "http://localhost:4566").replace(/\/$/, "");
    const res = await fetch(`${endpoint}/_localstack/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    localstack = res.ok ? "ready" : "unreachable";
  } catch (err) {
    console.error("[health] localstack check failed:", err);
  }

  const overall = postgres === "ready" && localstack === "ready" ? "ready" : "starting";

  return NextResponse.json(
    { api: "ready", postgres, localstack, overall },
    { status: overall === "ready" ? 200 : 503 },
  );
}
