# For a real VM (docker-compose.prod.yml), not Render (which uses its own
# native Node runtime + buildCommand/startCommand instead of this file).
FROM node:20-alpine
WORKDIR /repo

# NODE_ENV is deliberately NOT set here: `next build` needs devDependencies
# (typescript, eslint, etc.) present, and setting NODE_ENV=production
# before `npm ci` would make npm skip installing them. It's set at
# container *runtime* instead, via docker-compose.prod.yml's environment.
COPY . .
RUN npm ci
RUN npx turbo run build --filter=@gluconimbus/web...

EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate --workspace=@gluconimbus/web && npm run start --workspace=@gluconimbus/web"]
