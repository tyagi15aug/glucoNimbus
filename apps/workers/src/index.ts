import "./load-env";
import { receiveReadingMessages, deleteReadingMessage } from "@gluconimbus/cloud";
import { processMessage } from "./process-message";

/**
 * Long-running consumer: long-poll the ingest queue, process each
 * message, delete it on success. Standing in for a deployed Lambda (spec
 * Section 6) — see docs/adr/0008-event-driven-pipeline.md for why a
 * worker process rather than an actual LocalStack Lambda function was the
 * right call here, and what that trade-off costs.
 */
let shuttingDown = false;
process.on("SIGINT", () => {
  shuttingDown = true;
});
process.on("SIGTERM", () => {
  shuttingDown = true;
});

async function loop(): Promise<void> {
  console.log("[workers] polling gluconimbus-ingest...");
  while (!shuttingDown) {
    const messages = await receiveReadingMessages();
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
        // maxReceiveCount. Log and keep polling.
        console.error("[workers] failed to process message (left on queue for retry):", err);
      }
    }
  }
  console.log("[workers] shutting down.");
}

loop().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
