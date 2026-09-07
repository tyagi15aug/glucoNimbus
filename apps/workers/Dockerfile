# Not used for local dev (there, `npm run dev` runs this natively —
# see repo root README). This image is for deployed environments,
# selected at runtime by the WORKER_MODE env var (see src/index.ts):
# unset/"live" for docker-compose.prod.yml's always-on worker
# (VM hosting, currently shelved — see docs/adr/0011); "once" as the
# image for the hosted Cloud Run Job (infrastructure/gcp/README.md),
# invoked on a schedule instead of staying resident.
FROM node:20-alpine
WORKDIR /repo

# Same NODE_ENV note as apps/web/Dockerfile: tsx (which actually runs this
# app, see package.json's "start" script) is a devDependency, so it must
# not be pruned at install time.
COPY . .
RUN npm ci

CMD ["npm", "run", "start", "--workspace=@gluconimbus/workers"]
