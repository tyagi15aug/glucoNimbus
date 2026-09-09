import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo@gluconimbus.dev";
const DEMO_PASSWORD = process.env["DEMO_DEVELOPER_PASSWORD"] ?? "gluconimbus-demo-2026";
const PASSWORD = "correcthorsebatterystaple";

function uniqueEmail(tag: string): string {
  return `pw-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/**
 * HTTP-level integration tests for /api/failure-rules and
 * /api/failure-rules/:id (docs/adr/0013-failure-injection.md). The
 * role-gating half is the point of these tests as much as the CRUD half
 * is — requireRole() (lib/require-role.ts) is what actually protects
 * these routes, independent of middleware.ts, since an API route is
 * reachable directly regardless of what any page does.
 */
test.describe("role gating", () => {
  test("GET with no session -> 401 UNAUTHENTICATED", async ({ request }) => {
    const res = await request.get("/api/failure-rules");
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("GET with a USER-role session -> 403 FORBIDDEN (a real session, just not enough role)", async ({
    request,
  }) => {
    const email = uniqueEmail("user-role");
    await request.post("/api/auth/register", { data: { email, password: PASSWORD } });

    const res = await request.get("/api/failure-rules");
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  test("GET with a DEVELOPER session -> 200", async ({ request }) => {
    await request.post("/api/auth/login", { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });

    const res = await request.get("/api/failure-rules");
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).rules)).toBe(true);
  });
});

test.describe("rule lifecycle (DEVELOPER)", () => {
  test.beforeEach(async ({ request }) => {
    await request.post("/api/auth/login", { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  });

  test("a created rule appears in the list; deleting it removes it and 404s on a second delete", async ({
    request,
  }) => {
    const createRes = await request.post("/api/failure-rules", {
      data: { scope: "processing", failureType: "error", probability: 0.5 },
    });
    expect(createRes.status()).toBe(201);
    const { rule } = await createRes.json();

    const listRes = await request.get("/api/failure-rules");
    const { rules } = await listRes.json();
    expect(rules.some((r: { id: string }) => r.id === rule.id)).toBe(true);

    const deleteRes = await request.delete(`/api/failure-rules/${rule.id}`);
    expect(deleteRes.status()).toBe(200);
    expect((await deleteRes.json()).deleted).toBe(true);

    const listAfter = await request.get("/api/failure-rules");
    expect((await listAfter.json()).rules.some((r: { id: string }) => r.id === rule.id)).toBe(false);

    const secondDelete = await request.delete(`/api/failure-rules/${rule.id}`);
    expect(secondDelete.status()).toBe(404);
  });

  test("a db_outage rule at ingestion scope is rejected at creation (422) — that scope never touches Postgres", async ({
    request,
  }) => {
    const res = await request.post("/api/failure-rules", {
      data: { scope: "ingestion", failureType: "db_outage", probability: 1 },
    });
    expect(res.status()).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
  });

  test("a delay rule without delayMs is rejected at creation (422)", async ({ request }) => {
    const res = await request.post("/api/failure-rules", {
      data: { scope: "processing", failureType: "delay", probability: 1 },
    });
    expect(res.status()).toBe(422);
  });

  test("DELETE of a nonexistent id -> 404 NOT_FOUND", async ({ request }) => {
    const res = await request.delete("/api/failure-rules/00000000-0000-0000-0000-000000000000");
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
