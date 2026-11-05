---

description: "Task list for the Local Storytelling & Video Automation Platform"
---

# Tasks: Local Storytelling & Video Automation Platform

**Input**: Design documents from `specs/001-local-video-platform/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: The spec does not ask for TDD. The only test tasks included are those the
constitution (v1.0.0, *Development Workflow & Quality Gates*) requires: the config lint, the
deterministic render test, and the offline smoke test.

**Organization**: spec.md has no user stories (running `/speckit-clarify` is recommended). The
stories below come from the build phases in spec §8 and from plan.md, ordered by the value each
delivers on its own:

- **US1 (P1)**: Create a project and edit a timeline with a live Remotion preview (spec §8 Phase 2)
- **US2 (P2)**: Render the timeline to an MP4 locally and download it from MinIO (spec §8 Phase 4)
- **US3 (P3)**: Generate a story script from a prompt with the local LLM (spec §8 Phase 3, LLM part)
- **US4 (P4)**: Generate 3D overlays through Blender MCP (spec §8 Phase 3, Blender part)

Render comes before AI so that one manual path (edit → preview → render) works from start to
finish before the AI features build on it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

This is a pnpm monorepo (plan.md → Project Structure): `apps/web`, `apps/worker`,
`packages/{shared,db,storage,compositions}`, `services/blender-mcp`, `infra/`, `scripts/`,
`tests/`. "Contracts" means `specs/001-local-video-platform/contracts/`.

**Global rules for every task** (constitution v1.0.0):

- Pin exact versions. No `^` or `~` in package.json, and no floating image tags.
- Never add a cloud SDK, a remote URL, telemetry, or a runtime download.
- Read config only through the env loader from T014.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Set up the monorepo, the infra files, and the constitution config lint

- [X] T001 Create root workspace files:
  - `package.json`: `"private": true`, `"packageManager": "pnpm@<current>"`, scripts `lint`,
    `lint:config`, `typecheck`, `test`, `test:render`.
  - `pnpm-workspace.yaml`: `apps/*`, `packages/*`.
  - `.npmrc`: `save-exact=true`.
  - `tsconfig.base.json`: strict, `moduleResolution: "bundler"`, path aliases `@storyflow/*`.
  - `.gitignore`: `.env`, `node_modules`, `.next`, `dist`, `out`, `*.mp4`, `packages/db/src/generated`.
- [X] T002 [P] Add ESLint (flat config) and Prettier in `eslint.config.mjs` and `.prettierrc`.
  Add a `no-restricted-imports` rule that bans `openai` and `@anthropic-ai/*` everywhere except
  `packages/shared/src/llm/**`.
- [X] T003 [P] Copy `contracts/infra/docker-compose.yml` to `docker-compose.yml` at the repo root
  unchanged.
- [X] T004 [P] Copy `contracts/infra/litellm.config.yaml` to `infra/litellm/config.yaml`.
- [X] T005 [P] Copy `contracts/infra/minio-init.sh` to `infra/minio/minio-init.sh` (LF line
  endings, executable), and `contracts/infra/.env.example` to `.env.example`.
- [X] T006 [P] Scaffold `packages/shared/package.json` (`@storyflow/shared`, deps: `zod@4.6.7`,
  `openai@7.50.0`). Use subpath exports `.`, `./llm` (server-only), `./queue`, `./props`,
  `./schemas`. Add `packages/shared/tsconfig.json`.
- [X] T007 [P] Scaffold `packages/db/package.json` (`@storyflow/db`, deps: `prisma@7.10.1`,
  `@prisma/client@7.10.1`, `@prisma/adapter-pg@7.10.1`, `pg`, `pg-boss@12.38.0`). Scripts:
  `generate`, `migrate:dev`, and `migrate:deploy` (= `prisma migrate deploy && node dist/seed.js`).
  Add `packages/db/tsconfig.json`.
- [X] T008 [P] Scaffold `packages/storage/package.json` (`@storyflow/storage`, deps:
  `@aws-sdk/client-s3@3.1161.0`, `@aws-sdk/s3-request-presigner@3.1161.0`,
  `@aws-sdk/lib-storage@3.1161.0`). Add `packages/storage/tsconfig.json`.
- [X] T009 [P] Scaffold `packages/compositions/package.json` (`@storyflow/compositions`, deps:
  `remotion@4.0.540`, `@remotion/fonts@4.0.540`, `react@19.3.1`, `react-dom@19.3.1`). Every
  `@remotion/*` package MUST be exactly `4.0.540`. Add `packages/compositions/remotion.config.ts`
  and `tsconfig.json`.
- [X] T010 [P] Scaffold `apps/web` with Next.js 15.5.29 App Router, React 19.3.1, Tailwind CSS,
  `@remotion/player@4.0.540`, `@dnd-kit/core`, `@dnd-kit/modifiers`, `@dnd-kit/utilities`
  (exact versions). Add `output: "standalone"` and `serverExternalPackages: ["pg-boss", "@prisma/client"]`
  to `apps/web/next.config.ts`. Workspace deps: `@storyflow/{shared,db,storage,compositions}`.
- [X] T011 [P] Scaffold `apps/worker/package.json`:
  - Deps: `@remotion/renderer@4.0.540`, `@remotion/bundler@4.0.540`, `@remotion/cli@4.0.540`,
    `@modelcontextprotocol/sdk@1.32.2`, `pg-boss@12.38.0`, and the workspace packages.
  - Build with `tsc` to `dist/`.
  - Add `apps/worker/tsconfig.json`.
- [X] T012 [P] Scaffold `services/blender-mcp/requirements.txt` with pinned `mcp==2.3.0`,
  `boto3`, `pydantic`, `uvicorn` (exact `==` versions), plus `services/blender-mcp/server/__init__.py`.
- [X] T013 Write the constitution config lint in `scripts/lint-config.mjs` (Node, no deps) and
  wire it to `pnpm lint:config`. Exit non-zero and print `file:line rule` for each of these:
  1. A compose `image:` with no tag, `:latest`, or `:main-latest`.
  2. A compose port not prefixed with `127.0.0.1:`.
  3. In `infra/litellm/config.yaml`, any `api_key`, or a `model:` prefix in
     `openai/ anthropic/ gemini/ azure/ bedrock/ vertex_ai/ groq/ mistral/ cohere/`.
  4. Under `apps/` and `packages/`, a string literal matching
     `/(minioadmin|sk-[A-Za-z0-9-]{8,}|password\s*[:=]\s*["'][^"']+)/i`, or a `fonts.googleapis.com` URL.
  5. A `^` or `~` version range in any `package.json`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Config, database, schemas, storage, queue, composition, images, and stack boot. Every
story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Config & schemas (packages/shared)

- [X] T014 [P] Write the env loader in `packages/shared/src/env.ts`.
  - Parse with Zod and fail fast, listing every missing variable: `DATABASE_URL`,
    `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT` (optional, web only), `S3_REGION`, `S3_ACCESS_KEY_ID`,
    `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_ASSETS`, `S3_BUCKET_RENDERS`, `LITELLM_BASE_URL`,
    `LITELLM_API_KEY`, `LITELLM_MODEL`, `RENDER_CONCURRENCY` (int, default 4),
    `REMOTION_SERVE_URL`, `BLENDER_MCP_DIRECT_URL`.
  - Reject any URL whose host is not `localhost`, `127.0.0.1`, `host.docker.internal`, or a
    compose service name (`postgres|minio|litellm|blender-mcp|web`). This is constitution I.
- [X] T015 [P] Write the StoryScript Zod schema in `packages/shared/src/schemas/story-script.ts`,
  mirroring `contracts/story-script.schema.json` exactly:
  - `schemaVersion` literal 1; `title` 1–120 chars; `logline` ≤ 300; `fps` ∈ {24,25,30,60}.
  - `style.palette` ≤ 6 hex `#RRGGBB`; `style.fontFamily` ∈ {Inter, Merriweather, JetBrainsMono}.
  - `scenes` 1–40, each with:
    - `title` 1–120, `narration` ≤ 2000, `onScreenText` ≤ 200, `visualPrompt` ≤ 1000
    - `durationSeconds` 1–60, `transition` ∈ {cut,fade,slide,wipe} (default cut)
    - optional `asset3d` {tool ∈ {render_text_logo, render_primitive_scene, render_turntable}, params}
  - Use `.strict()` objects.
  - Export `StoryScriptJsonSchema` built with `z.toJSONSchema()`, for LiteLLM `response_format`.
- [X] T016 [P] Write the composition props schemas in `packages/shared/src/schemas/composition-props.ts`,
  following `contracts/composition-props.md`:
  - `StoryCompositionProps`: `schemaVersion` 1, width, height, fps ∈ {24,25,30,60},
    `durationInFrames` ≥ 1, `seed` int, `style`, `tracks[]` with `clips[]`, and optional
    `assetUrls: Record<string,string>`.
  - `ClipProps`:
    - `text` ≤ 200, `transform` {x,y,scale,rotation}, `opacity` 0–1, `fit` ∈ {cover,contain}
    - `transitionIn` / `transitionOut` {type ∈ {fade,slide,wipe}, durationInFrames}
    - `volume` 0–1
- [X] T017 [P] Write the Blender tool param schemas in `packages/shared/src/schemas/blender-tools.ts`,
  following `contracts/blender-mcp-tools.md`:
  - Common fields: `projectId`, `outputId`, width/height 64–3840 and even (default 1920×1080),
    `engine` ∈ {EEVEE,CYCLES} (default EEVEE), `samples` 1–256 (default 32), `seed` (default 0),
    `transparent` (default true).
  - `render_text_logo`: `text` 1–40, `fontFamily` enum, `extrude` 0–1 (default 0.1), `color` hex,
    `metallic` / `roughness` 0–1, `output` ∈ {STILL_PNG, ANIMATION_WEBM, GLB}, `frames` 1–600.
  - `render_primitive_scene`: `objects` ≤ 12 with
    `shape ∈ {CUBE,SPHERE,CYLINDER,CONE,TORUS,PLANE}`; `camera.lensMm` 12–200;
    `lighting ∈ {STUDIO,SUNSET,NIGHT}`; `output ∈ {STILL_PNG, ANIMATION_WEBM}`; `frames` 1–600.
  - `render_turntable`: `modelAssetKey`, `frames` 24–600, `lighting`.
  - Export `Blender3dToolParams` as a discriminated union on `tool`.
- [X] T018 [P] Write the queue payload schemas and queue names in `packages/shared/src/queue/payloads.ts`,
  following `contracts/queue-jobs.md`:
  - Queue names: `script.generate`, `asset3d.render`, `video.render`.
  - Payloads `ScriptGeneratePayload`, `Asset3dRenderPayload`, and `VideoRenderPayload`, each
    with `jobId`.
  - Queue options table: retry 2/1/1, expire 10/10/60 min, singleton keys
    `script:{projectId}` and `render:{inputPropsHash}`.
- [X] T019 Write the timeline validation in `packages/shared/src/timeline/validate.ts`. Return
  every issue found, not just the first:
  - Clips on one track must not overlap: "`[startFrame, startFrame + durationInFrames)` ranges
    must not intersect".
  - Each clip's asset kind must fit its track kind (VISUAL→IMAGE|VIDEO, OVERLAY_3D→RENDER_3D,
    AUDIO→AUDIO, TEXT→assetId null).
  - `startFrame` ≥ 0, `durationInFrames` ≥ 1, `trimStartFrame` ≥ 0.
  - At most 16 tracks and at most 200 clips per track.
  - Also export `computeDurationInFrames(tracks)` (max clip end, minimum 1).
- [X] T020 Write `buildCanonicalProps(project, tracks, clips)` and `hashCanonicalProps(props, assets, compositionId, remotionVersion)`
  in `packages/shared/src/props/canonical.ts`:
  - The output refers to assets only by ID and never contains URLs.
  - The hash is SHA-256 over: canonical JSON with recursively sorted keys, the referenced assets'
    `sha256` sorted by ID, `compositionId`, and `"4.0.540"`.
  - This is the ONLY producer of canonical props (contracts/composition-props.md).

### Database & queue (packages/db)

- [X] T021 Copy the Prisma schema from `data-model.md` (the "Prisma schema" section) exactly
  into `packages/db/prisma/schema.prisma`. Create `packages/db/prisma.config.ts`, which reads
  `DATABASE_URL` from env and uses the migrations path `prisma/migrations`.
- [X] T022 Create the Prisma client singleton with `@prisma/adapter-pg` in
  `packages/db/src/client.ts`. Re-export the generated types from `packages/db/src/index.ts`.
- [X] T023 Generate the initial migration with `pnpm --filter @storyflow/db migrate:dev --name init`
  against the compose Postgres. Commit `packages/db/prisma/migrations/*_init/migration.sql`.
- [X] T024 Write the seed in `packages/db/src/seed.ts`. It upserts Template `slug: "reference"`
  (`compositionId: "StoryComposition"`, 1920×1080, 30 fps, 150 frames). Its `defaultProps` holds
  only TEXT and solid-color clips, so it needs no asset files. It MUST pass `StoryCompositionProps`
  (T016). The seed must be idempotent.
- [X] T025 Write the pg-boss wrapper in `packages/db/src/queue.ts`:
  - `getBoss()`: one shared instance per process, `schema: "pgboss"`, started lazily.
  - `createQueues()`: creates the three queues from T018 with their retry and expire options.
  - `enqueue(name, payload)`: validates with Zod, then calls `send` with the singleton key.
  - `work(name, { localConcurrency }, handler)`: validates the payload and calls the handler.
- [X] T026 Write the Job helpers in `packages/db/src/jobs.ts`:
  - `createJob(projectId, type, input)` → status QUEUED.
  - `markRunning(jobId)`, which sets `startedAt` and increments `attempts`.
  - `reportProgress(jobId, 0..1)`, throttled to at most one write per second per job.
  - `succeed(jobId, output)`, `fail(jobId, message)`, `cancel(jobId)`.
  - Enforce the state machine from data-model.md: SUCCEEDED and CANCELLED are terminal; FAILED
    goes back to QUEUED only while attempts < 3. Invalid transitions throw.

### Storage (packages/storage)

- [X] T027 [P] Write the S3 clients in `packages/storage/src/client.ts`:
  - `internalS3` (endpoint `S3_ENDPOINT`) and `publicSigner` (endpoint `S3_PUBLIC_ENDPOINT`, used
    only for signing), both with `forcePathStyle: true`.
  - Region and credentials come from env (T014). Never hardcode them.
- [X] T028 [P] Write the object key builders in `packages/storage/src/keys.ts`, using the pattern
  `projects/{projectId}/{kind}/{assetId}.{ext}`, and a per-kind MIME allow-list:
  - IMAGE: png, jpeg, webp
  - VIDEO: mp4, webm
  - AUDIO: mpeg, wav, ogg
  - MODEL_3D: `model/gltf-binary`
  - RENDER_3D: png, zip
  - FONT: woff2
  - FINAL_RENDER: mp4
- [X] T029 Write the storage operations in `packages/storage/src/objects.ts`:
  - `presignPut(bucket, key, mimeType, sizeBytes)` and `presignGet(bucket, key, mode: "public"|"internal")`,
    each expiring after 15 min.
  - `headObject`, `sha256Object` (streamed), and `uploadFile(bucket, key, path, mimeType)` using
    `@aws-sdk/lib-storage` multipart upload.
- [X] T030 Write `resolveProps(canonical, assets, mode)` in `packages/storage/src/resolve.ts`. It
  fills `assetUrls` with presigned GET URLs for each referenced READY asset, using `public` mode
  for the browser and `internal` mode for the render worker (research R9). It throws if any
  referenced asset is not READY.

### Composition (packages/compositions)

- [X] T031 [P] Add the self-hosted fonts `Inter`, `Merriweather`, and `JetBrainsMono` (`.woff2`,
  OFL licensed) to `packages/compositions/public/fonts/`. Write `packages/compositions/src/fonts.ts`,
  which loads them with `@remotion/fonts` `loadFont({ url: staticFile(...) })`.
- [X] T032 [P] Write the layer components in `packages/compositions/src/layers/`:
  - `VisualLayer.tsx`: `<Img>` / `<OffthreadVideo>` with `fit` and `trimStartFrame`.
  - `Overlay3dLayer.tsx`: PNG still, or a PNG sequence via frame index.
  - `TextLayer.tsx`
  - `AudioLayer.tsx`: `<Audio>` with `volume`.
  - `transitions.ts`: fade, slide, and wipe, derived only from `useCurrentFrame()`.
  - Missing `assetUrls[assetId]` MUST throw. `Math.random`, `Date`, and `fetch` are forbidden;
    use Remotion `random(\`${seed}-${clipId}\`)`.
- [X] T033 Write `packages/compositions/src/StoryComposition.tsx`. It renders tracks sorted by
  `order` (higher draws on top), puts each clip in a `<Sequence from={startFrame} durationInFrames>`,
  and skips tracks with `muted` set. Write `packages/compositions/src/Root.tsx`, which registers
  `<Composition id="StoryComposition" schema={StoryCompositionProps} calculateMetadata>`. Its
  width, height, fps, and duration come from props. Write `packages/compositions/src/index.ts`
  with `registerRoot`.

### Services, images & stack boot

- [X] T034 [P] Write a minimal Blender MCP server in `services/blender-mcp/server/app.py`:
  - Official `mcp` SDK, Streamable HTTP transport at `/mcp` on `MCP_HTTP_PORT`.
  - `GET /healthz` returns `{"status":"ok","blender":"<version>"}`, where the version is read from
    `blender --version` at startup.
  - Empty tool registry for now; tools are added in US4.
- [X] T035 [P] Write `services/blender-mcp/Dockerfile`:
  - Base `debian:bookworm-slim` (pin its digest).
  - Install the Blender runtime libs (libxi6, libxxf86vm1, libxfixes3, libxrender1, libgl1,
    libxkbcommon0, libsm6).
  - Download the official Blender `4.5.x` Linux x64 tarball at build time, check it against a
    hard-coded `BLENDER_SHA256`, and extract it to `/opt/blender`.
  - `pip install -r requirements.txt` into Blender's bundled Python.
  - Copy the fonts from T031 into `/opt/fonts`.
  - Non-root user; `CMD` starts `server/app.py`.
- [X] T036 [P] Write `apps/worker/Dockerfile`. It is multi-stage on `node:24.22.2-bookworm-slim`
  (pin its digest):
  - Install with pnpm `--frozen-lockfile`.
  - Build `packages/*` and `apps/worker`.
  - `prisma generate`.
  - `npx remotion bundle packages/compositions/src/index.ts --out-dir /app/bundle`.
  - `npx remotion browser ensure`, which bakes Chrome Headless Shell in (research R5).
  - Copy `packages/db/prisma` for `migrate:deploy`.
  - Set `NEXT_TELEMETRY_DISABLED=1` and `CHECKPOINT_DISABLE=1`. Non-root user.
- [X] T037 [P] Write `apps/web/Dockerfile`. It is multi-stage on `node:24.22.2-bookworm-slim`
  (pin its digest):
  - pnpm install, `prisma generate`, `next build` with `NEXT_TELEMETRY_DISABLED=1`.
  - The runtime stage copies `.next/standalone`, `.next/static`, and `public`.
  - Non-root user; port 3000.
- [X] T038 Write the worker entrypoint skeletons:
  - `apps/worker/src/pipeline.ts` and `apps/worker/src/render.ts` each start pg-boss through
    `getBoss()`, call `createQueues()`, register handlers from `apps/worker/src/handlers/`
    (empty for now), log to stdout as JSON, and shut down cleanly on SIGTERM
    (`boss.stop({ graceful: true })`).
  - `render.ts` MUST register `video.render` with `localConcurrency: 1` (constitution III).
- [X] T039 Write the web server helpers in `apps/web/src/server/http.ts`:
  - `route(handler)` turns a `ZodError` into 422 `{error, issues}`, `NotFoundError` into 404,
    and `ConflictError` into 409. Anything else becomes 500 with no stack trace in the body.
  - Also write `apps/web/src/server/errors.ts`.
- [X] T040 Write the health endpoint in `apps/web/src/app/api/health/route.ts`, matching
  `contracts/openapi.yaml#/paths/~1health`:
  - postgres: `SELECT 1`.
  - minio: `HeadBucket` on both buckets.
  - litellm: `GET {LITELLM_BASE_URL}/health/liveliness`.
  - blenderMcp: list MCP tools through LiteLLM, falling back to direct `/healthz`.
  - 200 when everything is ok, otherwise 503 `{status:"degraded"}`.
- [X] T041 Create the web app shell: `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`
  (Tailwind), and `apps/web/tailwind.config.ts`. Use only system or self-hosted fonts; no
  `next/font/google`.
- [X] T042 Boot the stack and confirm Phase 2:
  1. `cp .env.example .env` and fill in the values.
  2. `docker compose build && docker compose up -d`.
  3. Confirm `minio-init` and `db-migrate` exit 0 and `GET http://127.0.0.1:3000/api/health`
     returns `ok` (quickstart Checks 1–3).
  4. Run `pnpm lint:config` and confirm it exits 0.

**Checkpoint**: The stack is healthy, the schema is migrated, the `reference` template is seeded,
and the composition is bundled. User stories can now start.

---

## Phase 3: User Story 1 - Create a project, edit the timeline, live preview (Priority: P1) 🎯 MVP

**Goal**: A creator can create a project, optionally from a template, upload media, arrange and
trim clips on a multi-track timeline, and watch the result update immediately in
`@remotion/player`.

**Independent Test**: quickstart Check 6.
1. Create a project from the `reference` template and upload one image.
2. Drag it onto a VISUAL track, then trim it and add a TEXT clip.
3. The Player updates at about 30 fps, a reload keeps the layout, and saving from a stale
   second tab returns 409.

### Implementation for User Story 1

- [X] T043 [P] [US1] Write the project service in `apps/web/src/server/projects.ts`:
  - `list()` returns projects where `archivedAt` is null, ordered by `updatedAt desc`.
  - `create({title, prompt?, templateSlug?, width?, height?, fps?})` enforces: "title 1–120
    chars", "prompt ≤ 4000 chars", "width, height 16–7680, both even (H.264 requirement)", and
    "fps one of 24, 25, 30, 60". When a template is given, it builds the tracks and clips from
    the template's `defaultProps`.
  - `get(id)`, `update(id, patch)` with the same rules, and `archive(id)`, which sets `archivedAt`.
- [X] T044 [P] [US1] Write the template route in `apps/web/src/app/api/templates/route.ts`
  (`GET`, returns every Template, per `contracts/openapi.yaml`).
- [X] T045 [US1] Write the project routes in `apps/web/src/app/api/projects/route.ts` (GET, POST
  → 201) and `apps/web/src/app/api/projects/[projectId]/route.ts` (GET, PATCH, DELETE → 204),
  using the schemas `ProjectCreate` and `ProjectUpdate` from `contracts/openapi.yaml`.
- [X] T046 [US1] Write the timeline service in `apps/web/src/server/timeline.ts`:
  - `getTimeline(projectId)` returns `{revision, durationInFrames, tracks, previewProps}`. The
    `previewProps` are `buildCanonicalProps` (T020) passed through `resolveProps(..., "public")`
    (T030).
  - `putTimeline(projectId, {baseRevision, tracks})` runs in one Prisma transaction:
    1. If `baseRevision !== timelineRevision`, throw `ConflictError` (409).
    2. Run `validateTimeline` (T019), returning 422 with every issue.
    3. Check every referenced asset belongs to the project.
    4. Delete and recreate the tracks and clips.
    5. Set `durationInFrames = computeDurationInFrames`.
    6. Increment `timelineRevision`.
- [X] T047 [US1] Write the timeline route in `apps/web/src/app/api/projects/[projectId]/timeline/route.ts`
  (GET, PUT; `TimelineWrite` / `Timeline` in `contracts/openapi.yaml`).
- [X] T048 [P] [US1] Write the asset service in `apps/web/src/server/assets.ts`:
  - `createUpload(projectId, {kind, mimeType, sizeBytes, filename})` checks the MIME type against
    the allow-list (T028) and the "Upload limit 2 GiB" (`sizeBytes` ≤ 2147483648). It creates a
    PENDING Asset (`source: UPLOAD`, bucket `S3_BUCKET_ASSETS`, key from T028) and returns a
    presigned PUT.
  - `complete(assetId)`:
    1. HEAD the object; if it is missing or its size differs, return 409.
    2. Compute `sha256`.
    3. Probe dimensions and duration with `@remotion/media-parser` `parseMedia` (local, pinned
       `4.0.540`). For images, use `image-size`.
    4. Set the asset READY.
  - `list(projectId, kind?)` and `getUrl(assetId)`, which returns a public presigned GET.
- [X] T049 [US1] Write the asset routes:
  - `apps/web/src/app/api/projects/[projectId]/assets/route.ts` (GET `?kind=`)
  - `apps/web/src/app/api/projects/[projectId]/assets/uploads/route.ts` (POST → 201)
  - `apps/web/src/app/api/assets/[assetId]/complete/route.ts` (POST)
  - `apps/web/src/app/api/assets/[assetId]/url/route.ts` (GET)
- [X] T050 [P] [US1] Write the projects home page in `apps/web/src/app/page.tsx`: a project list
  and a "New project" dialog (title, template picker from `/api/templates`, resolution and fps
  presets) in `apps/web/src/components/NewProjectDialog.tsx`.
- [X] T051 [P] [US1] Write `apps/web/src/components/PlayerPanel.tsx`, a client component that
  renders `@remotion/player` `<Player component={StoryComposition}>`:
  - Its `inputProps` come from the editor state through `buildCanonicalProps`, plus the
    `assetUrls` from `previewProps`.
  - `compositionWidth`, `compositionHeight`, `fps`, and `durationInFrames` come from the project.
  - It has controls and a frame scrubber kept in sync with the timeline playhead.
- [X] T052 [P] [US1] Write the `useTimeline` hook in `apps/web/src/hooks/useTimeline.ts`:
  - Local editor state, seeded from `GET /timeline`.
  - Optimistic edits with a 750 ms debounced `PUT /timeline` that sends `baseRevision`.
  - On 409, show a "Timeline changed elsewhere — reload" banner and stop autosaving.
  - On 422, show the issues inline.
- [X] T053 [US1] Write the timeline editor in `apps/web/src/components/timeline/`:
  - `Timeline.tsx`: tracks drawn on a frame-based ruler, with zoom.
  - `TrackRow.tsx`: muted and locked toggles.
  - `ClipBlock.tsx`: `@dnd-kit` drag to move along the track and between compatible tracks,
    snapping to whole frames; left and right trim handles that update `startFrame`,
    `durationInFrames`, and `trimStartFrame`.
  - Block any overlapping drop before saving, using `validateTimeline`.
- [X] T054 [P] [US1] Write `apps/web/src/components/AssetLibrary.tsx`:
  - Upload by file picker or drop, following the flow createUpload → `PUT` to `uploadUrl` →
    `complete`, with progress.
  - A grid of READY assets with thumbnails from `/api/assets/{id}/url`.
  - Drag an asset onto a compatible track to create a clip.
- [X] T055 [P] [US1] Write `apps/web/src/components/ClipInspector.tsx`, which edits the selected
  clip's `ClipProps`: text ≤ 200, transform, opacity 0–1, fit, transitionIn and transitionOut,
  and volume 0–1 (T016 limits).
- [X] T056 [US1] Write the editor page in `apps/web/src/app/projects/[projectId]/page.tsx`. It
  lays out PlayerPanel, Timeline, AssetLibrary, and ClipInspector, wired to `useTimeline`, and
  has an "Add track" menu (VISUAL, OVERLAY_3D, TEXT, AUDIO) and project settings (title, fps,
  resolution).
- [ ] T057 [US1] Run quickstart Check 6 against the compose stack and fix any failures.
  - _Partial (2026-11-04): Check 6 passed at the API level (409/422/revision/preview URLs); the browser drag/trim UI is not yet exercised (Chrome extension not connected)._

**Checkpoint**: US1 works on its own. This is the MVP.

---

## Phase 4: User Story 2 - Render the timeline to MP4 locally (Priority: P2)

**Goal**: The creator clicks Render and gets an H.264 MP4. It is rendered by the throttled local
Remotion worker, saved to the MinIO `remotion-videos` bucket, and downloadable from the UI.
Rendering the same inputs again reuses the earlier render.

**Independent Test**: quickstart Checks 7 and 8.
1. Render the `reference` project.
2. During the render, `docker stats` shows render-worker at or below 400% CPU.
3. The MP4 appears in `remotion-videos/projects/{id}/FINAL_RENDER/`.
4. A second POST with no changes returns 200 with the same Render.
5. The determinism test passes.

### Tests for User Story 2 (constitution-required)

- [X] T058 [US2] Write the deterministic render test in `tests/render/determinism.test.ts` (Vitest):
  1. Bundle `packages/compositions`.
  2. `renderStill` frames 0, 75, and 149 of the `reference` template's `defaultProps` twice to PNG.
  3. Assert each pair's SHA-256 is equal.
  Wire it to `pnpm test:render`, and add `tests/vitest.config.ts`.

### Implementation for User Story 2

- [X] T059 [P] [US2] Write the render service in `apps/web/src/server/renders.ts`:
  - `createRender(projectId, {force})`:
    1. Build canonical props (T020).
    2. If the timeline is empty, or any referenced asset is not READY, return 422.
    3. Compute `inputPropsHash` (T020).
    4. Unless `force` is set, return the existing successful Render with that hash as 200.
    5. Otherwise create a Job (type VIDEO_RENDER) and a Render (with the `inputProps` snapshot,
       `codec: "h264"`), enqueue `video.render` `{jobId, projectId, renderId, compositionId, inputPropsHash}`,
       and return 202.
  - `listRenders(projectId)`.
- [X] T060 [P] [US2] Write the job service in `apps/web/src/server/jobs.ts`:
  - `getJob(id)`.
  - `cancelJob(id)`: if the job is already terminal, return 409; otherwise
    `boss.cancel(queue, queueJobId)` and `cancel(jobId)` (T026).
- [X] T061 [US2] Write the routes:
  - `apps/web/src/app/api/projects/[projectId]/renders/route.ts` (GET; POST → 200 or 202)
  - `apps/web/src/app/api/jobs/[jobId]/route.ts` (GET)
  - `apps/web/src/app/api/jobs/[jobId]/cancel/route.ts` (POST)
- [X] T062 [US2] Write the renderer in `apps/worker/src/lib/renderer.ts`. `renderVideo({serveUrl, compositionId, inputProps, outPath, onProgress, cancelSignal})`
  uses `selectComposition` and then `renderMedia` with `codec: "h264"` and
  `concurrency: Math.min(env.RENDER_CONCURRENCY, 4)`. **Never exceed 4** (constitution III).
  `serveUrl` comes from `REMOTION_SERVE_URL` (the pre-built bundle). It never calls `bundle()` at
  runtime.
- [X] T063 [US2] Write the `video.render` handler in `apps/worker/src/handlers/video-render.ts`:
  1. `markRunning`, then load the Render row.
  2. `resolveProps(inputProps, assets, "internal")`.
  3. Render to `/tmp/{renderId}.mp4`, with `onProgress` → `reportProgress` and Remotion
     `makeCancelSignal` tied to the Job status (polled every 2 s).
  4. `uploadFile` to `S3_BUCKET_RENDERS` at `projects/{projectId}/FINAL_RENDER/{assetId}.mp4`.
  5. Create Asset (kind FINAL_RENDER, source RENDER, READY, sha256, sizeBytes, width, height,
     durationMs, sourceJobId).
  6. Set `Render.outputAssetId` and `renderMs`, then `succeed`.
  7. Always delete the tmp file. On error, `fail` with a message the user can read.
  Register it in `apps/worker/src/render.ts`.
- [X] T064 [P] [US2] Write `apps/web/src/components/RenderPanel.tsx`:
  - A Render button and a "Force re-render" option.
  - It polls `GET /api/jobs/{id}` every 1 s while the job is QUEUED or RUNNING, with a progress
    bar and a Cancel button.
  - Render history from `GET /renders`, with a download link from `/api/assets/{outputAssetId}/url`.
  Add it to `apps/web/src/app/projects/[projectId]/page.tsx`.
- [X] T065 [US2] Run quickstart Checks 7 and 8 and `pnpm test:render`, and fix any failures.

**Checkpoint**: US1 and US2 together give a full manual pipeline, from editing to MP4.

---

## Phase 5: User Story 3 - Generate a story script from a prompt with the local LLM (Priority: P3)

**Goal**: The creator types a prompt. The self-hosted LLM (LAN server), reached through LiteLLM, returns a
StoryScript that passes the schema. The creator can review and edit it, then apply it to build
the timeline.

**Independent Test**: quickstart Check 4.
1. Generate from a prompt; the Job reaches SUCCEEDED.
2. A ScriptVersion whose content passes `story-script.schema.json` exists, and scenes appear.
3. Applying it builds TEXT clips on the timeline.
4. `docker compose logs litellm` shows only `local-llm` calls to the private `LLM_API_BASE`.

### Implementation for User Story 3

- [X] T066 [P] [US3] Write the LiteLLM client in `packages/shared/src/llm/client.ts`, the only
  file allowed to import `openai` (T002 rule). It builds `new OpenAI({ baseURL: env.LITELLM_BASE_URL, apiKey: env.LITELLM_API_KEY })`.
  `model` is restricted to `"local-llm"` (`deepseek-local` removed with Ollama, constitution 2.0.0).
- [X] T067 [P] [US3] Write the prompts in `packages/shared/src/llm/prompts.ts`:
  - The audiovisual-director system prompt states the StoryScript rules, the scene count and
    duration targets (derived from `targetDurationSeconds`), and the allowed fonts.
  - It lists the three Blender tools with their param summaries (from T017) for optional `asset3d`.
  - It says to return JSON only.
- [X] T068 [US3] Write `generateStoryScript({prompt, model, targetDurationSeconds})` in
  `packages/shared/src/llm/generate-script.ts`:
  1. Chat completion with `response_format: {type: "json_schema", json_schema: {name: "StoryScript", schema: StoryScriptJsonSchema, strict: true}}`.
  2. Parse, then run `StoryScript.safeParse`.
  3. On failure, make up to 2 repair turns that send the Zod issues back to the model.
  4. Then throw `ScriptValidationError`.
  5. Validate each `asset3d.params` against T017. If it is invalid, drop `asset3d` and log a
     warning; don't fail the whole script.
- [X] T069 [US3] Write the `script.generate` handler in `apps/worker/src/handlers/script-generate.ts`:
  1. `markRunning`, then `generateStoryScript`.
  2. In one transaction, create a ScriptVersion (`version` = max + 1 per project, `source: LLM`,
     `model`, `sourcePrompt`, `content`) and its Scenes (`order` from 0; `durationInFrames = round(durationSeconds × fps)`;
     `asset3d` copied over).
  3. If `autoRender3d` is set, then for each scene with `asset3d`, create a PENDING Asset
     (RENDER_3D, source BLENDER) and a Job (ASSET_3D), and enqueue `asset3d.render`. These jobs
     wait in the queue until US4 registers a consumer.
  4. `succeed` with `{scriptVersionId, sceneCount, asset3dJobIds}`.
  Register it in `apps/worker/src/pipeline.ts` with `localConcurrency: 1`.
- [X] T070 [US3] Write the script service in `apps/web/src/server/scripts.ts`:
  - `enqueueGenerate(projectId, {prompt ≤ 4000, model, targetDurationSeconds 5–300, autoRender3d})`:
    if an active `script:{projectId}` singleton exists, return 409; otherwise create the Job and
    enqueue it.
  - `list(projectId)`.
  - `saveManual(projectId, content)`: validate with StoryScript (422 on failure) and create a new
    version with `source: MANUAL` plus its Scenes.
  - `apply(projectId, version)`, in one transaction:
    1. Set `currentScriptVersionId`.
    2. Replace the timeline: one TEXT track with a sequential clip per scene (`props.text` =
       `onScreenText ?? title`, transitions mapped from `transition`). Add one OVERLAY_3D track
       with a clip for each scene whose RENDER_3D asset is READY.
    3. Increment `timelineRevision` and return the Timeline.
- [X] T071 [US3] Write the routes:
  - `apps/web/src/app/api/projects/[projectId]/scripts/generate/route.ts` (POST → 202 or 409)
  - `apps/web/src/app/api/projects/[projectId]/scripts/route.ts` (GET; POST → 201)
  - `apps/web/src/app/api/projects/[projectId]/scripts/[version]/apply/route.ts` (POST)
- [X] T072 [P] [US3] Write `apps/web/src/components/PromptPanel.tsx`: a prompt textarea (4000
  max, with a counter), a target duration (the model select was removed with Ollama; the app always sends `local-llm`), an
  auto-3D toggle, and a Generate button. It shows job progress and errors through
  `GET /api/jobs/{id}`.
- [X] T073 [P] [US3] Write `apps/web/src/components/ScriptEditor.tsx`: a version picker, an
  editable scene list (title, narration, on-screen text, duration, transition), "Save as new
  version" (POST MANUAL), and "Apply to timeline". When applying would overwrite a non-empty
  timeline, show an inline confirmation.
- [X] T074 [US3] Add PromptPanel and ScriptEditor as a "Script" tab in
  `apps/web/src/app/projects/[projectId]/page.tsx`.
- [X] T075 [US3] Run quickstart Check 4 against your LAN LLM server (`LLM_*` in `.env`) and fix any failures.
  - _Done 2026-11-04 with `ollama_chat/gpt-oss:20b` on a LAN Ollama (10.0.0.78): 5-scene script in 30 s on the first attempt, schema-valid, applied → 5 TEXT clips / 900 frames._

**Checkpoint**: The prompt → script → timeline → preview → render flow works without 3D.

---

## Phase 6: User Story 4 - 3D overlays through Blender MCP (Priority: P4)

**Goal**: 3D elements (text logos, primitive scenes, turntables) are rendered by headless Blender
through the MCP server's closed tool list. They are triggered either from the LLM script's
`asset3d` or by hand, saved to MinIO as RENDER_3D assets, and usable on OVERLAY_3D tracks.

**Independent Test**: quickstart Check 5.
1. `POST /api/projects/{id}/assets/3d` with `render_text_logo` `{text:"StoryFlow"}`; the Job
   succeeds within 120 s.
2. The RENDER_3D asset is READY in `storyflow-assets`.
3. Running the same params twice gives the same `sha256`.
4. Dropping it on an OVERLAY_3D track shows it in the Player.

### Implementation for User Story 4

- [X] T076 [P] [US4] Write the Blender runner in `services/blender-mcp/server/runner.py`:
  - `run_blender(script_path, args, timeout=300)` runs `/opt/blender/blender -b --factory-startup -t ${BLENDER_THREADS} --python <script> -- <json args>`.
  - An `asyncio.Lock` allows one Blender process at a time.
  - If the timeout is exceeded, kill the process and raise the MCP error `-32001 RENDER_TIMEOUT`.
  - Stdout and stderr go to the log.
- [X] T077 [P] [US4] Write the shared bpy helpers in `services/blender-mcp/server/bpy_common.py`
  (runs inside Blender):
  - `set_engine(name)` reads `bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items` at
    run time and maps EEVEE and CYCLES to an identifier that exists. Never hardcode it.
  - `setup_lighting(STUDIO|SUNSET|NIGHT)` builds procedural lights and world color, with no HDRI.
  - `set_output(width, height, samples, seed, transparent)`.
  - `find_principled(mat)`, which finds the node by `n.type == "BSDF_PRINCIPLED"`, never by name.
- [X] T078 [P] [US4] Write `services/blender-mcp/server/scenes/text_logo.py`: extruded text using
  `/opt/fonts/{fontFamily}`, a material from color, metallic, and roughness, and output
  STILL_PNG, ANIMATION_WEBM (rotation over `frames`), or GLB.
- [X] T079 [P] [US4] Write `services/blender-mcp/server/scenes/primitive_scene.py`: up to 12
  primitives with location, rotation, scale, and color; a camera from `location`, `lookAt`, and
  `lensMm`; output STILL_PNG or ANIMATION_WEBM.
- [X] T080 [P] [US4] Write `services/blender-mcp/server/scenes/turntable.py`:
  1. Download `modelAssetKey` from MinIO to tmp over the internal S3 endpoint.
  2. Import the GLB, center and scale it to its bounding box, and animate a 360° Z rotation over
     `frames`.
  3. Output a PNG sequence zip.
- [X] T081 [US4] Write the S3 upload in `services/blender-mcp/server/storage.py` (boto3, path-style,
  env credentials). It uploads to `projects/{projectId}/RENDER_3D/{outputId}.{ext}` and computes
  `sha256`, `sizeBytes`, width, height, and frames.
- [X] T082 [US4] Register the three tools in `services/blender-mcp/server/app.py`:
  - Each tool's pydantic input model matches `contracts/blender-mcp-tools.md` (same limits as T017).
  - Each handler runs the scene script through `runner.py`, uploads through `storage.py`, and
    returns `{outputs:[{objectKey,mimeType,sha256,sizeBytes,width,height,frames}], blenderVersion, renderMs}`.
  - No other tools.
- [X] T083 [US4] Verify the LiteLLM MCP gateway with the pinned `main-v1.83.14-stable`
  (research R8). From `pipeline-worker`, list and call `render_text_logo` through LiteLLM's MCP
  endpoint (`http://litellm:4000/mcp`, master key).
  - If `tools/call` works, set `MCP_ROUTE=litellm`.
  - Otherwise set `MCP_ROUTE=direct`, which uses `BLENDER_MCP_DIRECT_URL`.
  - Record the result and the reason as a comment in `docker-compose.yml` (pipeline-worker env)
    and in `research.md` R8.
- [X] T084 [US4] Write the MCP client in `apps/worker/src/lib/mcp.ts`, using the
  `@modelcontextprotocol/sdk` Streamable HTTP client. `callBlenderTool(tool, params)` connects
  according to `MCP_ROUTE` (T083), validates params against T017, and calls the tool with a
  320 s timeout. It returns the parsed result or throws a typed error that preserves `-32001`.
- [X] T085 [US4] Write the `asset3d.render` handler in `apps/worker/src/handlers/asset3d-render.ts`:
  1. `markRunning`.
  2. `callBlenderTool(tool, {...params, projectId, outputId: assetId})`.
  3. HEAD-check `outputs[0].objectKey` in MinIO and compare the returned `sha256` with
     `sha256Object`.
  4. Update the Asset to READY (objectKey, mimeType, sha256, sizeBytes, width, height,
     `metadata.frames`, sourceJobId), then `succeed`.
  5. On error, set the Asset to FAILED and `fail`.
  Register it in `apps/worker/src/pipeline.ts` with `localConcurrency: 1`. That also drains any
  jobs US3 queued.
- [X] T086 [US4] Write the route in `apps/web/src/app/api/projects/[projectId]/assets/3d/route.ts`
  (POST → 202). It validates `{sceneId?, tool, params}` against T017 (422 on failure), creates a
  PENDING Asset (kind RENDER_3D, source BLENDER, bucket `S3_BUCKET_ASSETS`), creates a Job of
  type ASSET_3D, and enqueues `asset3d.render`.
- [X] T087 [P] [US4] Write `apps/web/src/components/Asset3dPanel.tsx`: pick a tool, fill a form
  generated from the T017 schema, submit, and show job progress. When it finishes, the asset
  shows up in AssetLibrary and can be dragged onto OVERLAY_3D tracks. Add it to the editor page
  in `apps/web/src/app/projects/[projectId]/page.tsx`.
- [X] T088 [US4] Run quickstart Check 5, including sha256 matching across two identical runs, and
  re-run Check 4 with `autoRender3d: true`. Fix any failures.
  - _Partial: Check 5 passed (sha256 identical across runs, WebM via direct route); Check 4 rerun with `autoRender3d: true`: script in 24 s with 2 `asset3d` scenes (`render_text_logo` 55 s, `render_primitive_scene` 69 s), applied → TEXT:3 + OVERLAY_3D:2, 600-frame MP4 rendered in 18 s, frames inspected._

**Checkpoint**: Every story works on its own and the full spec pipeline runs end to end.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Constitution gates, pinning, docs, and final validation

- [X] T089 Write the offline gate `scripts/offline-smoke.sh` (constitution-required):
  1. `docker compose up -d --wait`.
  2. Assert `/api/health` is ok.
  3. Assert egress is blocked from `render-worker` and `blender-mcp` (quickstart Check 3
     commands must exit 0).
  4. Create a project from `reference` through the API, POST a render, poll until SUCCEEDED
     (15 min timeout), and assert the MP4 object exists in `remotion-videos`.
  5. Exit non-zero on any failure.
- [X] T090 [P] Pin every third-party image in `docker-compose.yml`, `apps/web/Dockerfile`,
  `apps/worker/Dockerfile`, and `services/blender-mcp/Dockerfile` by `@sha256:` digest, using
  `docker compose pull` and `docker image inspect --format '{{index .RepoDigests 0}}'`. Then
  rerun `pnpm lint:config`.
- [X] T091 [P] Check that telemetry is off everywhere. Grep container env for
  `NEXT_TELEMETRY_DISABLED=1`, `CHECKPOINT_DISABLE=1`, and `LITELLM_LOCAL_MODEL_COST_MAP=True`,
  and confirm `infra/litellm/config.yaml` has `telemetry: false`. Then run
  `docker compose logs litellm web` with the host offline and confirm there are no outbound
  connection errors. Write the findings to `docs/telemetry-audit.md`.
- [X] T092 [P] Write `README.md`:
  - Prerequisites and the one-time online provisioning (quickstart "Prerequisites").
  - `.env` setup and `docker compose up`.
  - Service URLs, all on `127.0.0.1`.
  - The architecture diagram, updated for pg-boss, the self-built Blender MCP, and the `pgsty`
    MinIO images.
  - A Remotion license notice (free for individuals and companies of up to 3 people; larger
    companies need a license).
  - Constitution gates (`pnpm lint:config`, `pnpm test:render`, `scripts/offline-smoke.sh`).
- [X] T093 [P] Update the root `spec.md` so it matches the constitution and this plan:
  - Replace §5 and §6 with references to `docker-compose.yml` and `infra/litellm/config.yaml`.
  - Remove the `gpt-4o-mini` entry and the hardcoded credentials in §7.1 and §7.2.
  - Replace BullMQ with pg-boss in §3.
  - Copy the same edits into `specs/001-local-video-platform/spec.md`.
- [X] T094 Harden security in `apps/web/src/server/` and `infra/`:
  - Presigned URLs expire after 15 min or less.
  - `MINIO_API_CORS_ALLOW_ORIGIN` is exactly `http://localhost:3000`.
  - Buckets stay private (`mc anonymous set none`).
  - API error bodies carry no stack traces.
  - Upload size is enforced on the server.
- [ ] T095 Run the full quickstart.md validation (Checks 1–9) on a clean `docker compose down -v`
  stack, including Check 9 with the host network turned off. Record the results in
  `specs/001-local-video-platform/checklists/validation.md`.
  - _Partial: see `checklists/validation.md`; Check 9 not yet repeated with the host network disconnected, Check 4 now passes._

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T001 goes first, and T013 comes after T003–T005.
- **Foundational (Phase 2)**: Depends on Setup and BLOCKS all user stories.
  - T014–T018 are parallel. T019 and T020 depend on T016.
  - T021 → T022 → T023 → T024 (T024 also needs T016). T025 and T026 depend on T022 and T018.
  - T027 and T028 are parallel. T029 depends on T027 and T028. T030 depends on T029 and T020.
  - T031 and T032 are parallel. T033 depends on T032 and T016.
  - T034–T037 are parallel. T036 needs T033 and T021. T038 depends on T025.
  - T042 needs everything above.
- **User Stories (Phase 3+)**: All depend on Phase 2.
  - **US1 (P1)**: Needs nothing beyond Phase 2.
  - **US2 (P2)**: Needs only Phase 2. Its API works on the seeded `reference` template without
    any US1 code. The RenderPanel (T064) mounts on the US1 editor page, so for UI testing build
    US1 first, or test US2 through the API alone.
  - **US3 (P3)**: Needs only Phase 2 for generation. `apply` writes the timeline, and US1 shows it.
  - **US4 (P4)**: Needs only Phase 2. It drains `asset3d.render` jobs if US3 queued any. The
    Asset3dPanel mounts on the US1 editor page.
- **Polish (Phase 7)**: After the stories you want are done. T089 needs US2 (render).

### Within Each User Story

- Services before routes before UI.
- Worker handlers before the UI that triggers them.
- Each story ends with a quickstart validation task.

### Parallel Opportunities

- **Setup**: T002–T012 (11 tasks) after T001.
- **Foundational**: {T014–T018}, {T027, T028}, {T031, T032}, {T034–T037}.
- **US1**: {T043, T044, T048}, then {T050, T051, T052, T054, T055} once the routes exist.
- **US2**: {T059, T060}, with T064 in parallel with T062 and T063.
- **US3**: {T066, T067}, {T072, T073}.
- **US4**: {T076–T080} (five separate Python files), plus T087 once T086 is done.
- **Across stories**: once Phase 2 is done, US2, US3, and US4 workers and services can be built
  alongside US1 (different files), and their UI tasks join the editor page at the end.

---

## Parallel Example: User Story 1

```bash
# After T042 (Phase 2 checkpoint):
Task: "T043 Project service in apps/web/src/server/projects.ts"
Task: "T044 Templates route in apps/web/src/app/api/templates/route.ts"
Task: "T048 Asset service in apps/web/src/server/assets.ts"

# After routes T045/T047/T049:
Task: "T050 Projects home page in apps/web/src/app/page.tsx"
Task: "T051 PlayerPanel in apps/web/src/components/PlayerPanel.tsx"
Task: "T052 useTimeline hook in apps/web/src/hooks/useTimeline.ts"
Task: "T054 AssetLibrary in apps/web/src/components/AssetLibrary.tsx"
Task: "T055 ClipInspector in apps/web/src/components/ClipInspector.tsx"
```

## Parallel Example: User Story 4

```bash
Task: "T076 Blender runner in services/blender-mcp/server/runner.py"
Task: "T077 bpy helpers in services/blender-mcp/server/bpy_common.py"
Task: "T078 Text logo scene in services/blender-mcp/server/scenes/text_logo.py"
Task: "T079 Primitive scene in services/blender-mcp/server/scenes/primitive_scene.py"
Task: "T080 Turntable scene in services/blender-mcp/server/scenes/turntable.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001–T013)
2. Phase 2: Foundational (T014–T042). The stack must be healthy and the lint must pass.
3. Phase 3: US1 (T043–T057)
4. **STOP and VALIDATE**: quickstart Check 6. You now have a local editor with live preview.

### Incremental Delivery

1. Setup and Foundational: a healthy local stack.
2. Add US1, then validate. **MVP**: edit and preview.
3. Add US2, then validate (Checks 7 and 8). This completes the manual video pipeline.
4. Add US3, then validate (Check 4). This adds AI scripting.
5. Add US4, then validate (Check 5). This completes the spec.
6. Polish, ending with the offline gate (Check 9), which constitution v1.0.0 requires before
   merge.

### Parallel Team Strategy

1. The team does Setup and Foundational together.
2. Then: Dev A on US1 (web editor), Dev B on US2 (render worker), Dev C on US3 (LLM pipeline),
   Dev D on US4 (Blender server, mostly Python).
3. The UI panels for US2–US4 (T064, T072–T074, T087) are added to the editor page once US1 is in.

---

## Notes

- [P] tasks = different files, no dependencies.
- The [Story] label maps each task to a user story for traceability.
- Constitution gates: `pnpm lint:config` (T013), `pnpm test:render` (T058), and
  `scripts/offline-smoke.sh` (T089) MUST pass before merge.
- Never add a cloud fallback, even an optional one (constitution I). If a local component fails,
  fail loudly.
- Commit after each task or logical group, and stop at any checkpoint to validate that story.
