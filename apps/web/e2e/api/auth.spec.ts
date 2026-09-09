import { test, expect } from "@playwright/test";

const PASSWORD = "correcthorsebatterystaple";

function uniqueEmail(tag: string): string {
  return `pw-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/**
 * HTTP-level integration tests for the actual auth route handlers
 * (register/login/logout/me) — apps/web/test/auth.test.ts already covers
 * the underlying lib functions (hashPassword/signSession/DB round trip)
 * in isolation; this covers the routes themselves end to end, including
 * cookie handling, which those unit tests can't reach (see
 * playwright.config.ts's comment on why).
 *
 * Each test gets a fresh Playwright `request` context with its own empty
 * cookie jar (Playwright's default, not something configured here), so
 * no cross-test cleanup is needed for session state — only the created
 * user rows persist in Postgres, tagged with a `pw-` prefix so they're
 * easy to find and clear later if that ever matters.
 */
test.describe("POST /api/auth/register", () => {
  test("creates a USER account, sets a session cookie, and returns the user shape", async ({ request }) => {
    const email = uniqueEmail("register");
    const res = await request.post("/api/auth/register", { data: { email, password: PASSWORD } });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user).toMatchObject({ email, role: "USER" });
    expect(body.user.id).toBeTruthy();
    expect(body.user.passwordHash).toBeUndefined(); // never serialized, even by accident
    expect(res.headers()["set-cookie"] ?? "").toContain("gluconimbus_session=");
  });

  test("rejects a duplicate email with 409 EMAIL_TAKEN", async ({ request }) => {
    const email = uniqueEmail("dup");
    const first = await request.post("/api/auth/register", { data: { email, password: PASSWORD } });
    expect(first.status()).toBe(201);

    const second = await request.post("/api/auth/register", { data: { email, password: PASSWORD } });
    expect(second.status()).toBe(409);
    expect((await second.json()).error.code).toBe("EMAIL_TAKEN");
  });

  test("rejects a too-short password with 422 VALIDATION_FAILED", async ({ request }) => {
    const res = await request.post("/api/auth/register", {
      data: { email: uniqueEmail("short"), password: "short" },
    });
    expect(res.status()).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
  });

  test("rejects a malformed JSON body with 400 INVALID_JSON", async ({ request }) => {
    // A plain string `data` with an application/json content-type gets
    // JSON-encoded by Playwright itself (`"not valid json"` is actually
    // valid JSON — a string literal), which defeats the point of this
    // test. A Buffer is sent as literal, untouched bytes.
    const res = await request.post("/api/auth/register", {
      data: Buffer.from("not valid json"),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
  });
});

test.describe("POST /api/auth/login", () => {
  test("logs in with correct credentials and sets a session cookie", async ({ request }) => {
    const email = uniqueEmail("login-ok");
    await request.post("/api/auth/register", { data: { email, password: PASSWORD } });

    const res = await request.post("/api/auth/login", { data: { email, password: PASSWORD } });
    expect(res.status()).toBe(200);
    expect((await res.json()).user.email).toBe(email);
    expect(res.headers()["set-cookie"] ?? "").toContain("gluconimbus_session=");
  });

  test("gives the same 401 INVALID_CREDENTIALS for a wrong password and for an unregistered email", async ({
    request,
  }) => {
    const email = uniqueEmail("login-badpw");
    await request.post("/api/auth/register", { data: { email, password: PASSWORD } });

    const wrongPassword = await request.post("/api/auth/login", { data: { email, password: "wrongpassword123" } });
    const unknownEmail = await request.post("/api/auth/login", {
      data: { email: uniqueEmail("never-registered"), password: PASSWORD },
    });

    expect(wrongPassword.status()).toBe(401);
    expect(unknownEmail.status()).toBe(401);
    // Same code/message in both cases is the actual point of this test —
    // a different response for "wrong password" vs "unknown email" would
    // let a caller enumerate registered addresses (route's own comment).
    const [wrongBody, unknownBody] = await Promise.all([wrongPassword.json(), unknownEmail.json()]);
    expect(wrongBody.error.code).toBe("INVALID_CREDENTIALS");
    expect(unknownBody.error.code).toBe("INVALID_CREDENTIALS");
    expect(wrongBody.error.message).toBe(unknownBody.error.message);
  });
});

test.describe("session lifecycle", () => {
  test("me reflects the session after register, and null after logout", async ({ request }) => {
    const email = uniqueEmail("lifecycle");
    const registerRes = await request.post("/api/auth/register", { data: { email, password: PASSWORD } });
    expect(registerRes.status()).toBe(201);

    // Playwright's `request` fixture is one APIRequestContext per test,
    // so the session cookie register set above is carried automatically
    // into these later calls within the same test — same as a browser.
    const meRes = await request.get("/api/auth/me");
    expect((await meRes.json()).user?.email).toBe(email);

    const logoutRes = await request.post("/api/auth/logout");
    expect(logoutRes.status()).toBe(200);

    const meAfterLogout = await request.get("/api/auth/me");
    expect((await meAfterLogout.json()).user).toBeNull();
  });

  test("me returns 200 with user: null (not a 401) when there was never a session", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(200);
    expect((await res.json()).user).toBeNull();
  });
});
