#!/usr/bin/env bash
# Runs alongside 01-create-buckets.sh under /etc/localstack/init/ready.d/
# — same "reproducible from `docker compose up`" bar (spec Section 27).
#
# DLQ created first so the main queue's redrive policy can reference its
# ARN. maxReceiveCount=3: a message gets up to 3 delivery attempts before
# the worker's processing failures (docs/adr/0008) move it off the main
# queue for a human to inspect via `awslocal sqs receive-message
# --queue-url <dlq-url>`.
set -euo pipefail

DLQ_URL=$(awslocal sqs create-queue --queue-name gluconimbus-ingest-dlq --query QueueUrl --output text)
DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url "$DLQ_URL" --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

awslocal sqs create-queue \
  --queue-name gluconimbus-ingest \
  --attributes "{
    \"VisibilityTimeout\": \"30\",
    \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"
  }"

echo "GlucoNimbus SQS queues ready (gluconimbus-ingest -> gluconimbus-ingest-dlq after 3 failed attempts)."
