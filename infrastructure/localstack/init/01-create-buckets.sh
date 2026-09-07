#!/usr/bin/env bash
# LocalStack runs everything under /etc/localstack/init/ready.d/ once the
# service is up — this is the "reproducible from `docker compose up`" bar
# from the spec (Section 27), not a manual setup step.
set -euo pipefail

awslocal s3 mb s3://glucostream-raw
awslocal s3 mb s3://glucostream-processed
awslocal s3 mb s3://glucostream-exports

echo "GlucoStream S3 buckets ready."
