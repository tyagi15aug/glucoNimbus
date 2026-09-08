# Deploying `apps/workers` as a scheduled Cloud Run Job

See `docs/adr/0011-scheduled-worker-for-hosting.md` for why this exists instead of an always-on
worker. This doc is the actual commands — none of this can be run from a Claude session (needs
your Google account and billing consent), so it's written as a checklist for you to run locally
with the `gcloud` CLI installed and authenticated (`gcloud auth login`).

## 0. One-time project setup

```bash
# Pick/create a project. Billing must be enabled even though this stays inside the free tier —
# Google requires a billing account on file to use Cloud Run/Scheduler at all.
gcloud config set project YOUR_PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com

# One-time Artifact Registry repo to hold the worker image.
gcloud artifacts repositories create gluconimbus \
  --repository-format=docker \
  --location=us-central1
```

**Set a budget alert now** (Billing → Budgets & alerts, $1 threshold is fine) — unlike Render/Oracle's
hard free-tier caps, Cloud Run bills automatically past the always-free allowance if this ever runs
more often or longer than expected.

## 1. Build and push the image

From the repo root (the Dockerfile needs the monorepo context for the workspace deps — it `COPY`s
the whole repo to reach `packages/db`, `packages/cloud`, etc., not just `apps/workers`).

`gcloud builds submit --tag ... --file ...` doesn't actually exist as a flag combination — `--tag`'s
implicit build only looks for a `Dockerfile` at the literal root of the context, with no way to point
it at `apps/workers/Dockerfile` instead. Use the small build config in this same folder instead,
which does that explicitly:

```bash
gcloud builds submit \
  --config=infrastructure/gcp/cloudbuild.yaml \
  --substitutions=_IMAGE=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/gluconimbus/workers:latest \
  .
```

(`gcloud builds submit` uses Cloud Build, itself covered by its own always-free monthly minutes for
a job this small and infrequent — no local Docker required, though `docker build -f
apps/workers/Dockerfile -t ... .` + `docker push` works the same way if you'd rather build locally.)

## 2. Create the Cloud Run Job

```bash
gcloud run jobs create gluconimbus-worker \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/gluconimbus/workers:latest \
  --region=us-central1 \
  --set-env-vars="WORKER_MODE=once" \
  --set-env-vars="DATABASE_URL=YOUR_NEON_CONNECTION_STRING" \
  --set-env-vars="AWS_ENDPOINT_URL=https://YOUR-LOCALSTACK-SERVICE.onrender.com" \
  --set-env-vars="AWS_ACCESS_KEY_ID=test,AWS_SECRET_ACCESS_KEY=test,AWS_REGION=us-east-1" \
  --max-retries=1 \
  --task-timeout=120s
```

Swap in the real Neon connection string and your Render-hosted LocalStack URL. `task-timeout=120s`
is generous headroom over the worst case (a handful of 10s long-polls until the queue drains empty).

Test it once by hand before scheduling:

```bash
gcloud run jobs execute gluconimbus-worker --region=us-central1
```

Check `gcloud run jobs executions list --job=gluconimbus-worker --region=us-central1` and the logs
(`gcloud run jobs executions logs read ...` or the Cloud Console) to confirm it drained the queue and
exited cleanly.

## 3. Let Cloud Scheduler invoke it on a schedule

Cloud Run Jobs are triggered over the Cloud Run Admin API, so Scheduler needs a service account with
permission to call it:

```bash
gcloud iam service-accounts create gluconimbus-scheduler \
  --display-name="Invokes the gluconimbus-worker Cloud Run Job"

gcloud run jobs add-iam-policy-binding gluconimbus-worker \
  --region=us-central1 \
  --member="serviceAccount:gluconimbus-scheduler@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

gcloud scheduler jobs create http gluconimbus-worker-tick \
  --location=us-central1 \
  --schedule="*/5 * * * *" \
  --uri="https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/YOUR_PROJECT_ID/jobs/gluconimbus-worker:run" \
  --http-method=POST \
  --oauth-service-account-email="gluconimbus-scheduler@YOUR_PROJECT_ID.iam.gserviceaccount.com"
```

`*/5 * * * *` = every 5 minutes. This uses 1 of Cloud Scheduler's 3 always-free jobs per billing
account — adjust the interval if you want readings to appear faster in the demo, but every 5 minutes
comfortably clears Cloud Run's always-free compute allowance for a job this short.

## 4. Sanity check

- `gcloud scheduler jobs run gluconimbus-worker-tick --location=us-central1` fires it immediately,
  same as waiting for the next tick.
- Watch Cloud Run Job execution logs for the `[workers] drain complete — N message(s) processed.`
  line, and confirm rows land in Neon (`psql` the connection string, or check the app's dashboard).

## Rolling back to an always-on worker

If Oracle capacity clears up, or another always-on host becomes viable, `apps/workers` needs no code
change — deploy the same image with `WORKER_MODE` unset (or `=live`) as a normal long-running
process (`docker-compose.prod.yml` already does this) and decommission the Cloud Run
Job/Scheduler pair above.
