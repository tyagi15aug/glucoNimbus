import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  type Message,
} from "@aws-sdk/client-sqs";
import type { CanonicalGlucoseEvent } from "@gluconimbus/types";

/**
 * The Phase 3 event-driven pipeline (docs/adr/0008-event-driven-pipeline.md):
 * `apps/web`'s POST /api/readings validates a reading and publishes it
 * here; `apps/workers` long-polls, persists, and deletes on success.
 * SQS's own visibility-timeout + redrive-policy is the retry/DLQ story —
 * nothing here implements retry logic itself.
 */
const sqsClient = new SQSClient({
  endpoint: process.env["AWS_ENDPOINT_URL"] ?? "http://localhost:4566",
  region: process.env["AWS_REGION"] ?? "us-east-1",
  credentials: {
    accessKeyId: process.env["AWS_ACCESS_KEY_ID"] ?? "test",
    secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"] ?? "test",
  },
});

const QUEUE_NAME = process.env["SQS_QUEUE_NAME"] ?? "gluconimbus-ingest";

/**
 * LocalStack's queue URL shape is predictable
 * (`<endpoint>/<accountId>/<queueName>`) under its default test-account
 * ID, so it's built directly rather than round-tripping through
 * GetQueueUrl on every publish — one less network call in the hot path,
 * and it matches the URL `infrastructure/localstack/init/02-create-queues.sh`
 * creates.
 */
function queueUrl(name: string): string {
  const endpoint = (process.env["AWS_ENDPOINT_URL"] ?? "http://localhost:4566").replace(/\/$/, "");
  const accountId = process.env["AWS_ACCOUNT_ID"] ?? "000000000000";
  return `${endpoint}/${accountId}/${name}`;
}

export interface QueuedReading {
  requestId: string;
  event: CanonicalGlucoseEvent;
}

/** Publishes a batch as individual messages — SendMessageBatch caps at 10 per call and the simulator can send up to 500. */
export async function publishReadingBatch(events: CanonicalGlucoseEvent[], requestId: string): Promise<void> {
  await Promise.all(
    events.map((event) =>
      sqsClient.send(
        new SendMessageCommand({
          QueueUrl: queueUrl(QUEUE_NAME),
          MessageBody: JSON.stringify({ requestId, event } satisfies QueuedReading),
        }),
      ),
    ),
  );
}

export interface ReceivedMessage {
  receiptHandle: string;
  body: QueuedReading;
}

/** Long-polls the ingest queue. Malformed bodies are skipped, not thrown — a message that isn't even parseable JSON can't be retried into validity, so it's logged and left for SQS's own redrive policy rather than crashing the poll loop. */
export async function receiveReadingMessages(maxMessages = 10, waitTimeSeconds = 10): Promise<ReceivedMessage[]> {
  const result = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl(QUEUE_NAME),
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: waitTimeSeconds,
    }),
  );

  const messages: ReceivedMessage[] = [];
  for (const m of (result.Messages ?? []) as Message[]) {
    if (!m.ReceiptHandle || !m.Body) continue;
    try {
      messages.push({ receiptHandle: m.ReceiptHandle, body: JSON.parse(m.Body) as QueuedReading });
    } catch (err) {
      console.error("[sqs] dropping unparseable message body:", err);
    }
  }
  return messages;
}

export async function deleteReadingMessage(receiptHandle: string): Promise<void> {
  await sqsClient.send(new DeleteMessageCommand({ QueueUrl: queueUrl(QUEUE_NAME), ReceiptHandle: receiptHandle }));
}
