import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo@gluconimbus.dev";
const DEMO_PASSWORD = process.env["DEMO_DEVELOPER_PASSWORD"] ?? "gluconimbus-demo-2026";

function validReading(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: `pw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    deviceId: "pw-test-device",
    participantId: "pw-test-participant",
    timestamp: new Date().toISOString(),
    glucose: 110,
    unit: "mg/dL",
    source: "synthetic",
    ...overrides,
  };
}

test("rejects a malformed reading with 422 VALIDATION_FAILED", async ({ request }) => {
  const res = await request.post("/api/readings", { data: validReading({ glucose: -50 }) });
  expect(res.status()).toBe(422);
  expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
});

test("a well-formed reading with no active rules gets 503 QUEUE_UNAVAILABLE — this environment has no reachable SQS", async ({
  request,
}) => {
  // Same limitation docs/adr/0008-event-driven-pipeline.md documents: no
  // LocalStack/SQS reachable here. That makes 503 the *correct* expected
  // outcome in this environment, not a workaround — it proves
  // publishReadingBatch's failure path is genuinely being exercised
  // (not skipped, not silently succeeding).
  const res = await request.post("/api/readings", { data: validReading() });
  expect(res.status()).toBe(503);
  expect((await res.json()).error.code).toBe("QUEUE_UNAVAILABLE");
});

test.describe("Phase 6 ingestion-scope failure injection (docs/adr/0013)", () => {
  test("an active ingestion 'error' rule pre-empts the SQS-unreachable 503 with a 500 INJECTED_FAILURE, and reverts once the rule is removed", async ({
    request,
  }) => {
    await request.post("/api/auth/login", { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
    const createRes = await request.post("/api/failure-rules", {
      data: { scope: "ingestion", failureType: "error", probability: 1 },
    });
    expect(createRes.status()).toBe(201);
    const { rule } = await createRes.json();

    try {
      const withRule = await request.post("/api/readings", { data: validReading() });
      expect(withRule.status()).toBe(500);
      expect((await withRule.json()).error.code).toBe("INJECTED_FAILURE");
    } finally {
      await request.delete(`/api/failure-rules/${rule.id}`);
    }

    // Back to the unreachable-SQS 503 once the rule's gone — the switch
    // between the two statuses, not either one alone, is what proves the
    // rule (and not something else) was the cause.
    const afterRemoval = await request.post("/api/readings", { data: validReading() });
    expect(afterRemoval.status()).toBe(503);
    expect((await afterRemoval.json()).error.code).toBe("QUEUE_UNAVAILABLE");
  });
});
