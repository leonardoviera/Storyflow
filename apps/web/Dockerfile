# StoryFlow web: Next.js 15 UI + /api route handlers (standalone output).
FROM node:24.22.2-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build

ENV CI=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1 CHECKPOINT_DISABLE=1
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@storyflow/web..."
RUN cd packages/db && DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm exec prisma generate
RUN cd apps/web && pnpm run build

FROM node:24.22.2-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 CHECKPOINT_DISABLE=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
