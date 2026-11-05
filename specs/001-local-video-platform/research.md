# Phase 0 Research: Local Storytelling & Video Automation Platform

All versions were checked against the npm, Docker Hub, and GHCR registries on 2026-11-04. Tags
are pinned in compose. Setup (T-phase 1) MUST also record each image's `@sha256:` digest.

## R1. Database: PostgreSQL vs SQLite

- **Decision**: PostgreSQL 16 (`postgres:16.15-alpine`) for app metadata and the job queue.
- **Rationale**: Three processes (web, pipeline-worker, render-worker) write at the same time. A
  shared SQLite file across containers would mean bind-mount coupling, which breaks Principle V,
  and it handles concurrent writes poorly. Postgres also hosts the queue (R3), so the service
  count stays the same. Version 16 has a longer support window than the spec's 15.
- **Alternatives**: SQLite was rejected because a file shared across containers locks under
  concurrent writes. Postgres 17 is viable, but 16 is the conservative choice and nothing
  requires 17.

## R2. MinIO image availability

- **Finding**: `minio/minio` and `minio/mc` now return *object not found* on Docker Hub. MinIO
  stopped publishing community images in 2025. The spec's compose file **cannot pull**.
- **Decision**: Use `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` and
  `pgsty/mc:RELEASE.2026-10-26T00-00-00Z`. These are community builds of the upstream AGPL
  source that are still maintained. Pin both by digest.
- **Fallback**: Add `infra/minio/Dockerfile` to build `minio` from an upstream release tag at
  image-build time (Go builder stage). Switch to it if the community image stops being trusted.
- **Alternatives**: `bitnamilegacy/minio` was rejected because it is frozen (2025-08) and
  unmaintained. `coollabsio/minio` was rejected because its last update was 2025-10. Garage and
  SeaweedFS were rejected because the constitution names MinIO; both stay S3-compatible escape
  hatches because all code uses only the S3 API.

## R3. Job queue: BullMQ vs pg-boss

- **Decision**: pg-boss 12.x on the existing Postgres, in its own `pgboss` schema.
- **Rationale**: BullMQ needs Redis, and the spec's compose has none (Principle V gap). pg-boss
  gives retries, singleton keys, expiry, and per-worker concurrency (`localConcurrency: 1` for
  renders) with no extra service. Its throughput (tens of jobs per minute) is far more than this
  workload needs.
- **Alternatives**: BullMQ plus Valkey works but adds a service, a volume, and an image to pin.
  A hand-rolled SQL queue would mean reimplementing retry, expiry, and locking.

## R4. ORM: Prisma 7

- **Decision**: Prisma 7.10.x with `@prisma/adapter-pg`, the `prisma-client` generator, and
  `prisma.config.ts`. `CHECKPOINT_DISABLE=1` turns off its update-check telemetry.
- **Rationale**: The spec names Prisma. Version 7's Rust-free client downloads no engine
  binaries at install or run time, which matches the constitution's no-runtime-downloads rule.
  8.0 is still a release candidate.
- **Alternatives**: Drizzle would also work, but the spec specifies Prisma.

## R5. Remotion rendering pipeline

- **Decision**:
  - The `apps/worker` image runs `remotion bundle` at build time, producing a static bundle at
    `/app/bundle`. It also runs `npx remotion browser ensure`, which bakes Chrome Headless Shell
    into the image.
  - `renderMedia({ codec: "h264", concurrency: 4 })` runs against the pre-built `serveUrl`.
  - Remotion 4's bundled FFmpeg (`@remotion/compositor-*`) is used, so no system FFmpeg is
    installed.
  - Base image: Debian `bookworm-slim`, because Chrome Headless Shell needs glibc.
  - `shm_size: 1gb`.
- **Rationale**: The spec's `bundle()` on every render is slow, and Remotion would download a
  browser on first run. Both conflict with the constitution's no-runtime-downloads rule and with
  determinism.
- **Licensing note**: Remotion is source-available. It is free for individuals and for companies
  with 3 or fewer people, and larger organizations need a company license. This must be
  confirmed before any commercial use.
- **Alternatives**: Calling FFmpeg directly was rejected because it loses the React composition
  model the spec requires.

## R6. Blender MCP server

- **Finding**: The spec's `nytimes/blender-mcp:latest` image can't be verified, and the widely
  used community `blender-mcp` add-ons drive a GUI Blender over a local socket and include online
  asset or generator tools (Poly Haven, Sketchfab, hosted text-to-3D). Those tools are banned by
  Principle IV.
- **Decision**: Self-build `services/blender-mcp`.
  - Base: `debian:bookworm-slim` with an official Blender 4.5 LTS Linux tarball. The tarball is
    downloaded **at image build**, with its SHA-256 checked.
  - A Python MCP server (official `mcp` SDK, Streamable HTTP transport at `/mcp`) runs headless
    Blender jobs as `blender -b -t 4 --python-expr ...` subprocesses, one per tool call.
  - The tools form a closed list of parameterized scene builders (see
    [blender-mcp-tools.md](./contracts/blender-mcp-tools.md)). There is no arbitrary-code tool and
    no network tool.
  - Outputs are uploaded to MinIO over S3. The server shares no volume with other services.
- **Rationale**: This server is fully auditable and works offline. A closed tool list keeps
  LLM-driven 3D deterministic and safe.
- **Alternatives**: A community add-on would need a GUI session and brings banned tools. An
  arbitrary `execute_python` tool was rejected because LLM-written code can't be audited or
  repeated.

## R7. LLM gateway and models

- **Superseded (2026-11-04, constitution v2.0.0)**: Ollama was removed. See "LLM backend on the
  private network" in the addenda below.
- **Decision**: LiteLLM `ghcr.io/berriai/litellm:main-v1.83.14-stable`. Models are served by
  host-native Ollama through `host.docker.internal` (`extra_hosts: host-gateway` for Linux).
  - `local-llm` → `ollama_chat/llama3.1:8b`, which supports tool calling. It is the default for
    scripts and tools.
  - `deepseek-local` → `ollama_chat/deepseek-r1:8b`, optional, for long-form story drafting
    only, with no tool use.
  - `LITELLM_LOCAL_MODEL_COST_MAP=True` stops the startup fetch of the model price list from
    GitHub. `litellm_settings.telemetry: false`.
- **Rationale**: The spec's `ollama/llama3` doesn't support tool calls, and its `gpt-4o-mini`
  entry breaks Principle I.
- **Alternatives**: Running Ollama in a container works for CPU-only setups but has poor GPU
  passthrough on Windows/macOS. It can be added later as a compose profile.

## R8. LLM → 3D orchestration pattern

- **Decision**: Two phases.
  1. **Script phase**: LiteLLM chat completion with `response_format` set to the
     [StoryScript JSON Schema](./contracts/story-script.schema.json). The output is validated
     with Zod and repaired at most twice (the validation error is sent back to the model). The
     result is saved as a `ScriptVersion`.
  2. **3D phase**: For each scene whose `asset3d` field is set, the pipeline worker enqueues
     `asset3d.render`. The worker gets the tool list from LiteLLM's MCP gateway (the `blender_mcp`
     server is registered there by compose service name) and calls the named tool with the
     structured parameters from the script.
- **Rationale**: The 3D work stays tool-driven through MCP (Principle IV) and still repeatable,
  because the LLM picks parameters inside a schema and never runs free in a tool loop.
- **Fallback**: If the pinned LiteLLM's MCP gateway can't proxy `tools/call`, the worker's MCP
  client calls `http://blender-mcp:8000/mcp` directly. The server stays registered in LiteLLM.
  The constitution allows this; record the choice in tasks.
- **Alternatives**: A fully agentic loop, where the LLM calls tools freely, was rejected because
  results can't be repeated and small local models handle multi-step tool calls poorly.

## R9. Asset URLs for preview vs render

- **Decision**: Stored data and canonical `inputProps` refer to assets **by ID** only. A resolver
  turns the IDs into short-lived presigned GET URLs.
  - **Browser Player**: URLs are signed against `S3_PUBLIC_ENDPOINT=http://localhost:9000`.
  - **Render worker**: URLs are signed against `S3_ENDPOINT=http://minio:9000`.
  - MinIO CORS is set with `MINIO_API_CORS_ALLOW_ORIGIN=http://localhost:3000`.
- **Rationale**: Signing happens offline, and preview and render get the same content through
  different hosts. The determinism hash covers canonical props plus each asset's `sha256`, never
  URLs.
- **Alternatives**: Proxying every asset through Next.js was rejected because it doubles the
  bandwidth for video and adds range-request complexity.

## R10. Network isolation

- **Decision**: Two networks.
  - `internal` is set to `internal: true`, so it has no route out.
  - `edge` is a bridge network, needed to publish loopback ports and for LiteLLM to reach
    host-native Ollama.
  - On `internal` only: blender-mcp, pipeline-worker, render-worker, db-migrate, minio-init.
  - On both networks: web, litellm, minio, postgres.
- **Rationale**: The containers that render and generate can't reach the internet at all, which
  enforces the no-runtime-downloads rule. Services that publish ports need a non-internal network.
- **Alternatives**: Putting everything on `internal` was rejected because published ports and
  `host.docker.internal` don't work there.

## R11. Timeline editing model

- **Decision**: Tracks hold clips positioned in frames. The whole timeline is saved with
  `PUT /timeline` as one replacement, with optimistic concurrency on `Project.timelineRevision`.
  `@dnd-kit` drives the UI. Each change rebuilds `inputProps` on the client for the Player.
- **Rationale**: For one user with 200 clips or fewer, whole-document saves are simpler and
  atomic. Revision checks catch saves from a stale tab.
- **Alternatives**: Per-clip PATCH and CRDTs are unnecessary for a single local user.

## R12. Testing and constitution gates

- **Decisions**:
  - `scripts/lint-config.mjs` fails on:
    - floating image tags (`latest`, `main-latest`, or no tag)
    - ports not prefixed with `127.0.0.1:`
    - `api_key` or cloud provider prefixes (`openai/`, `anthropic/`, `gemini/`, `azure/`,
      `bedrock/`, `vertex_ai/`) in the LiteLLM config
    - provider SDK imports outside `packages/shared/llm`
    - credential-shaped literals in `apps/` and `packages/`
  - `scripts/offline-smoke.sh` runs `docker compose up`, checks that egress is blocked from
    `render-worker` (an outbound request must fail), then renders the `reference` template and
    checks that the MP4 exists in MinIO.
  - Render determinism: render frames 0, mid, and last twice as PNG, and compare SHA-256 hashes.
- **Rationale**: These map one-to-one onto the constitution's Development Workflow gates.

## Out of scope / follow-ups

- **Voice narration**: The spec lists narration storage but no voice generation. For now audio is
  uploaded only. Local text-to-speech (e.g., Piper) is a candidate for a later feature.
- **Spec gaps**: The spec has no user stories, acceptance criteria, or functional requirements.
  Running `/speckit-clarify` is recommended before `/speckit-tasks` so that tasks can be tied to
  user stories.

## Implementation addenda (2026-11-04, `/speckit-implement`)

These changes were made during implementation, each with its reason. They take precedence over the
earlier entries above.

- **R6 (Blender source)**: Blender comes from Debian trixie's pinned package
  `blender=4.3.2+dfsg-2` on `debian:trixie-20261027-slim`, not an official 4.5 tarball.
  download.blender.org refuses scripted requests, so the tarball could not be fetched and
  checksummed. The Debian package is version-pinned and checked by apt.
- **R6 (engine)**: The default engine is **Cycles (CPU)** with a fixed seed, adaptive sampling
  off and denoising off. Headless containers have no GL context for Eevee, and this keeps output
  repeatable. `EEVEE` is honoured only with `BLENDER_ALLOW_EEVEE=1`.
- **R6 (MCP SDK)**: The server uses Python `mcp==1.30.0` (stable FastMCP API) instead of 2.3.0.
  It runs in a venv outside Blender and starts one `blender -b` subprocess per call.
- **R6 (animated output)**: `SEQUENCE_PNG_ZIP` became `ANIMATION_WEBM` (VP9 with alpha), because
  Remotion cannot play a ZIP of frames. It is played with `<OffthreadVideo transparent>`.
- **R5 (runtime)**: The worker and migration processes run TypeScript through `tsx`
  (`node --import tsx`), because the workspace packages export `.ts` source. The compose commands
  call binaries directly (no pnpm or corepack at runtime, since the internal network has no egress).
- **R4 (Prisma)**: Prisma does not accept enums declared on one line; they are expanded to
  multi-line in `schema.prisma` and `data-model.md`.
- **Composition props**: `ClipProps` gained `color` and `background` (TEXT styling).
  `StoryCompositionProps` gained `assetMedia` (asset id → `image | video | audio`), which is part
  of the canonical props, so layers pick `<Img>` or `<OffthreadVideo>` without URLs.
- **Composition schema**: Props are validated with Zod in `calculateMetadata`, not through
  `<Composition schema>`, because Remotion's schema editor targets Zod v3 and this repo pins Zod v4.
- **Tooling**: TypeScript is pinned at 5.9.3, not 7.x, which Next 15 tooling does not support.
- **Determinism test**: It runs inside the render-worker image (`pnpm test:render`), so it uses
  the baked browser and bundle and stays offline.
- **R8 (T083 verification)**: With LiteLLM `main-v1.83.14-stable`, `tools/list` and `tools/call`
  work through `http://litellm:4000/mcp/`, but LiteLLM cancels the upstream tool call after about
  60 s (`MCP client tool call was cancelled`) and never passes the result back. A 24-frame WebM
  (about 65 s) failed this way, while a still logo (29 s) succeeded. **Decision:** the pipeline worker
  uses `MCP_ROUTE=direct` (`http://blender-mcp:8000/mcp`); `blender_mcp` stays registered in LiteLLM
  for health and discovery. Go back to `MCP_ROUTE=litellm` once a pinned LiteLLM supports longer
  MCP call timeouts.

### LLM backend on the private network (2026-11-04, constitution 2.0.0)

- **Decision**: Ollama is removed. LiteLLM's single `local-llm` alias is backed by the owner's
  self-hosted LLM server on the private network, set entirely from `.env`: `LLM_MODEL` (provider
  prefix `hosted_vllm`, `lm_studio`, `ollama`, `ollama_chat`, `llamafile`, or `openai` for any
  OpenAI-compatible server), `LLM_API_BASE` (a private address) and `LLM_API_KEY` (the server's own
  key, or `none`). LiteLLM resolves `os.environ/` in every `litellm_params` field, including
  `model` (verified in the pinned image, `router.py`). `deepseek-local` was dropped.
- **Guards**: compose refuses to start without `LLM_MODEL`/`LLM_API_BASE`; `pnpm lint:config`
  rejects cloud provider prefixes and public `api_base` hosts in `.env`, `.env.example` and the
  LiteLLM config. An `openai/` model with no `api_base` would call api.openai.com, which is why
  the private `LLM_API_BASE` is mandatory.
- **Requirement on the server**: it must honour `response_format: json_schema` (vLLM, LM Studio,
  llama.cpp server and recent Ollama do). Script generation still repairs invalid output twice.
- **Limits**: the app sends at most one LLM request at a time (`script.generate` concurrency 1);
  the server's own CPU/GPU limits are the operator's responsibility (constitution III, v2.0.0).
