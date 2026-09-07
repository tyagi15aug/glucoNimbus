# For a real VM (docker-compose.prod.yml), not Render.
FROM node:20-alpine
WORKDIR /repo

# Same NODE_ENV note as apps/web/Dockerfile: tsx (which actually runs this
# app, see package.json's "start" script) is a devDependency, so it must
# not be pruned at install time.
COPY . .
RUN npm ci

CMD ["npm", "run", "start", "--workspace=@gluconimbus/workers"]
