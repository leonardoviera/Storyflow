# Implementation Plan: Local Storytelling & Video Automation Platform

**Branch**: `001-local-video-platform` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-local-video-platform/spec.md` (copied from the
root `spec.md`)

## Summary

A fully local studio that turns a text prompt into a rendered MP4. A Next.js 15 app holds the
script editor, a drag-and-drop timeline, and a live `@remotion/player` preview. A local LLM
(the owner's self-hosted server on the private network, reached only through the LiteLLM proxy) writes a structured, schema-checked
`StoryScript`. Each scene that needs 3D becomes a Blender job, sent through a self-built headless
Blender MCP server, and the result is stored in MinIO. The final video is rendered by a
throttled Remotion worker (4 threads, Remotion's bundled FFmpeg) and uploaded to MinIO.
PostgreSQL holds metadata, and **pg-boss** runs the job queue on the same Postgres, so no Redis is
needed. Every service is defined in a single `docker-compose.yml`, with ports bound to
`127.0.0.1` only and worker services on an internal network that has no route to the internet.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS (`node:24.22.2-bookworm-slim`); Python 3.11
(Blender 4.5 LTS's bundled interpreter) for the Blender MCP server

**Primary Dependencies**: Next.js 15.5.x (App Router, as the spec requires), React 19, Tailwind CSS,
`@dnd-kit`, Remotion 4.0.540 (`remotion`, `@remotion/player`, `@remotion/bundler`,
`@remotion/renderer`), Prisma 7.10.x with `@prisma/adapter-pg`, pg-boss 12.x, `openai` SDK
(pointed only at LiteLLM), `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, Zod 4,
`@modelcontextprotocol/sdk` 1.x (TypeScript MCP client), the official `mcp` Python SDK (Blender server)

**Storage**: PostgreSQL 16 (`postgres:16.15-alpine`) for metadata and the queue. MinIO
(`pgsty/minio:RELEASE.2026-08-04T00-00-00Z`, see research R2) for every binary asset

**Testing**: Vitest (unit and contract), Playwright (end-to-end against the compose stack), a
deterministic frame-hash render test, an offline smoke test (`scripts/offline-smoke.sh`), and a
config lint (`scripts/lint-config.mjs`)

**Target Platform**: A single developer or creator workstation running Docker Engine or Docker
Desktop (Linux, Windows with WSL2, or macOS), x86_64 or arm64. The LLM server is the owner's own
machine on the private network (constitution v2.0.0)

**Project Type**: Web application (Next.js UI and API) plus background workers and infrastructure
services, organized as a pnpm monorepo

**Performance Goals** (planning targets; the spec states none):
- Player preview at a steady 30 fps for 1080p compositions with 3 or more layers
- A 60 s 1080p30 H.264 render finishes in under 10 min on 4 threads
- Script generation with an 8B model finishes in under 90 s
- A Blender still render (Eevee, 1080p) finishes in under 60 s

**Constraints**:
- Must work fully offline (constitution Principle I)
- Rendering capped at 4 CPU threads (Principle III)
- Only one render job at a time
- No runtime downloads
- Every port bound to loopback
- Every image pinned

**Scale/Scope**: One local user, around 100 projects, videos of 5 minutes or less, timelines of
200 clips or fewer, total asset storage limited only by host disk

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Gate (constitution v1.0.0) | Pre-research | Post-design | Evidence |
|---|---|---|---|---|
| I | No cloud APIs, keys, or endpoints; works offline | ❌ spec ships `gpt-4o-mini` + `OPENAI_API_KEY` | ✅ | Cloud model removed: [litellm.config.yaml](./contracts/infra/litellm.config.yaml) lists local backends only |
| I | Telemetry and runtime downloads disabled | ⚠️ not addressed | ✅ | `NEXT_TELEMETRY_DISABLED`, `CHECKPOINT_DISABLE`, `LITELLM_LOCAL_MODEL_COST_MAP`, `telemetry: false`; Chrome Headless Shell and the Remotion bundle baked in at image build (R5) |
| II | Pure, typed, deterministic compositions | ✅ | ✅ | [composition-props.md](./contracts/composition-props.md): Zod schema, seeded `random()`, assets referenced by ID; frame-hash test |
| III | Rendering ≤ 4 threads; Blender limits; one LLM request in flight | ✅ | ✅ | `renderMedia({ concurrency: 4 })`, pg-boss `localConcurrency: 1` (render and `script.generate`), compose `cpus: "4"` limits; LLM server limits are the operator's (v2.0.0) |
| IV | 3D only via Blender MCP over HTTP; no external providers | ⚠️ unverified `nytimes/blender-mcp` image | ✅ | Self-built `services/blender-mcp` with a closed tool list ([blender-mcp-tools.md](./contracts/blender-mcp-tools.md)); no asset-search or online generator tools exist |
| V | Every component in compose; LLM server only via LiteLLM | ❌ BullMQ needs Redis, which compose lacks | ✅ | pg-boss on Postgres (R3); [docker-compose.yml](./contracts/infra/docker-compose.yml) defines web, workers, LiteLLM, MinIO, Postgres, Blender |
| Stack | Pinned images, loopback ports, secrets in `.env` | ❌ `:latest` tags, `0.0.0.0` ports, hardcoded passwords | ✅ | Pinned tags (digests pinned at setup), `127.0.0.1:` ports, [.env.example](./contracts/infra/.env.example) |
| Stack | MinIO image exists and is pinnable | ❌ `minio/minio` has been removed from Docker Hub | ✅ | R2: pinned community build, with a build-from-source fallback |

**Result**: Every pre-research failure is a spec defect, not a justified exception, and each one is
fixed in the design below. No Complexity Tracking entries are needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-local-video-platform/
├── spec.md
├── plan.md                         # This file
├── research.md                     # Phase 0: decisions R1–R12
├── data-model.md                   # Phase 1: entities, state machines, Prisma schema
├── quickstart.md                   # Phase 1: end-to-end validation guide
├── contracts/
│   ├── openapi.yaml                # Web API (Next.js route handlers)
│   ├── story-script.schema.json    # LLM structured-output contract
│   ├── composition-props.md        # Remotion inputProps contract
│   ├── queue-jobs.md               # pg-boss queue names and payloads
│   ├── blender-mcp-tools.md        # MCP tool surface of the Blender server
│   └── infra/
│       ├── docker-compose.yml      # Target compose file (copied to repo root during implement)
│       ├── litellm.config.yaml     # → infra/litellm/config.yaml
│       ├── minio-init.sh           # → infra/minio/minio-init.sh
│       └── .env.example            # → .env.example
└── tasks.md                        # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
docker-compose.yml
.env.example
pnpm-workspace.yaml
infra/
├── litellm/config.yaml
└── minio/minio-init.sh
apps/
├── web/                            # Next.js 15: UI + /api route handlers
│   ├── Dockerfile
│   └── src/
│       ├── app/                    # routes: /, /projects/[id], /api/**
│       ├── components/             # timeline (@dnd-kit), script editor, player
│       └── server/                 # services: projects, timeline, assets, jobs
└── worker/                         # Node background workers (one image, two entrypoints)
    ├── Dockerfile                  # bakes the Remotion bundle + Chrome Headless Shell
    └── src/
        ├── pipeline.ts             # script.generate, asset3d.render handlers
        ├── render.ts               # video.render handler
        └── lib/                    # litellm client, mcp client, renderer
packages/
├── compositions/                   # Remotion root, StoryComposition, scene components
├── db/                             # prisma/schema.prisma, migrations, prisma.config.ts
├── shared/                         # Zod schemas (StoryScript, inputProps, queue payloads), env
└── storage/                        # MinIO client, key builders, presigners
services/
└── blender-mcp/                    # Python MCP server running inside headless Blender
    ├── Dockerfile
    └── server/                     # tools, scene builders, s3 upload
scripts/
├── lint-config.mjs                 # constitution config lint
└── offline-smoke.sh                # offline gate
tests/
├── contract/                       # openapi, story-script, queue payload contracts
├── integration/                    # API ↔ Postgres/MinIO/LiteLLM, worker flows
├── render/                         # deterministic frame-hash tests
└── e2e/                            # Playwright
```

**Structure Decision**: This is a pnpm monorepo. The `apps/web` and `apps/worker` packages share
their schemas, compositions, database access, and storage code through `packages/*`. That way
the Player preview and the render worker import exactly the same `StoryComposition` and Zod
schemas, which keeps preview and output identical (Principle II). The Blender server lives in
`services/` because it is Python running inside Blender.

## Complexity Tracking

No constitution violations. Departures from the spec text (the self-built Blender image, the
community MinIO build, and pg-boss in place of BullMQ) are explained in [research.md](./research.md)
and are needed to comply with the constitution, not exceptions to it.
