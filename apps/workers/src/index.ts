import "./load-env";
import { receiveReadingMessages, deleteReadingMessage } from "@gluconimbus/cloud";
import { processMessage } from "./process-message";

/**
 * Two run modes, selected by WORKER_MODE (default "live"):
 *
 * - "live": long-poll forever (original behavior). Used for local dev,
 *   and any environment that can host an always-on process.
 * - "once": drain whatever is currently on the queue, then exit. Used
 *   for the hosted demo, where this runs as a Cloud Run Job invoked
 *   every few minutes by Cloud Scheduler instead of staying resident —
 *   see infrastructure/gcp/README.md and
 *   docs/adr/0011-scheduled-worker-for-hosting.md for why: no free
 *   hosting tier offers an always-on background worker, and this data
 *   is simulated, so near-real-time batch processing costs nothing
 *   the demo actually needs.
 *
 * Standing in for a deployed Lambda (spec Section 6) either way — see
 * docs/adr/0008-event-driven-pipeline.md for that original trade-off.
 */
let shuttingDown = false;
process.on("SIGINT", () => {
  shuttingDown = true;
});
process.on("SIGTERM", () => {
  shuttingDown = true;
});

async function processBatch(
  messages: Awaited<ReturnType<typeof receiveReadingMessages>>,
): Promise<void> {
  for (const message of messages) {
    try {
      const result = await processMessage(message.body);
      await deleteReadingMessage(message.receiptHandle);
      console.log(
        JSON.stringify({
          requestId: message.body.requestId,
          eventId: result.eventId,
          status: result.status,
        }),
      );
    } catch (err) {
      // Left on the queue on purpose — SQS redelivers after the
      // visibility timeout, then redrives to the DLQ after
      // maxReceiveCount. Log and keep going.
      console.error("[workers] failed to process message (left on queue for retry):", err);
    }
  }
}

async function runLive(): Promise<void> {
  console.log("[workers] polling gluconimbus-ingest (live mode)...");
  while (!shuttingDown) {
    const messages = await receiveReadingMessages();
    await processBatch(messages);
  }
  console.log("[workers] shutting down.");
}

async function runOnce(): Promise<void> {
  console.log("[workers] draining gluconimbus-ingest (once mode)...");
  let drained = 0;
  // Keep receiving until a poll comes back empty rather than stopping
  // after the first batch — a single ReceiveMessage call isn't
  // guaranteed to return everything that's available.
  for (;;) {
    const messages = await receiveReadingMessages();
    if (messages.length === 0) break;
    drained += messages.length;
    await processBatch(messages);
  }
  console.log(`[workers] drain complete — ${drained} message(s) processed.`);
}

const mode = (process.env["WORKER_MODE"] ?? "live").toLowerCase();
const run = mode === "once" ? runOnce() : runLive();

run.catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
