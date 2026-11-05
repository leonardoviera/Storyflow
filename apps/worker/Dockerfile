# StoryFlow worker image: pipeline-worker, render-worker and db-migrate.
# Everything the renderer needs is baked in at build time (research.md R5):
# the Remotion bundle and Chrome Headless Shell. No downloads at runtime (constitution I).
FROM node:24.22.2-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

ENV CI=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    REMOTION_SERVE_URL=/app/bundle

# Chrome Headless Shell runtime libraries (Remotion Linux requirements).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 \
      libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 \
      libpango-1.0-0 libcairo2 libcups2 \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable && corepack prepare pnpm@10.34.9 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@storyflow/worker..." --filter "@storyflow/db..."

# Prisma client (no DB connection needed for generate).
RUN cd packages/db && DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm exec prisma generate

# Pre-built Remotion bundle + browser baked into the image.
RUN cd packages/compositions \
 && pnpm exec remotion bundle src/index.ts --out-dir /app/bundle \
 && cd /app/apps/worker && pnpm exec remotion browser ensure

RUN chown -R node:node /app/apps/worker /app/bundle
USER node

WORKDIR /app/apps/worker
CMD ["node", "--import", "tsx", "src/pipeline.ts"]
