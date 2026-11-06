<!--
SYNC IMPACT REPORT (amendment 2026-11-06)
- Version change: 2.0.0 → 3.0.0 (MAJOR: Principle I's private-network exception widens from the
  LLM backend to every LiteLLM generation backend; governance makes any relaxation of I MAJOR)
- Proposal/rationale: spec 003 (storyboard frames) needs image generation. The owner's direction
  is that every AI call goes through LiteLLM, including image (and later voice/video), even
  before a model is provisioned behind it. Cloud/hosted generation APIs remain forbidden.
- Modified principles:
  - I. Strict Local Execution: "LLM inference" → "AI inference (text, image, and later voice or
    video)"; the private-network exception covers any LiteLLM backend, not only the LLM one.
  - III. Resource Throttling: "one LLM request in flight" → one request in flight per LiteLLM
    alias.
  - V. Decoupled, Containerized Architecture: the outside-compose exception covers self-hosted AI
    model servers, still reachable only through LiteLLM.
  - Local Stack Constraints / LiteLLM: LiteLLM is the only entry point for every AI modality; the
    app may request only declared aliases (`local-llm`, `local-image`); an alias may have no model
    yet and the app MUST degrade cleanly.
- Added sections: none
- Removed sections: none
- Migration (follow-up, outside this amendment):
  - scripts/lint-config.mjs: check IMAGE_MODEL / IMAGE_API_BASE like LLM_MODEL / LLM_API_BASE.
  - .env.example and litellm_config.yaml: document and declare the `local-image` alias.
  - specs/003-storyboard-shot-direction/spec.md: the "Constitution amendment needed" assumption is
    now satisfied by v3.0.0.
- Deferred TODOs: none
-->
<!--
SYNC IMPACT REPORT (amendment 2026-11-04)
- Version change: 1.0.0 → 2.0.0 (MAJOR: relaxes Principle I; governance makes any relaxation MAJOR)
- Proposal/rationale: the owner runs their own LLM server on their private network and does not
  want a host-native Ollama. LLM inference may now run on a self-hosted server on the private
  network (LAN), reached only through LiteLLM. Cloud/hosted LLM APIs remain forbidden.
- Modified principles:
  - I. Strict Local Execution: allowed outbound targets add a self-hosted LLM server at a private
    network address (LiteLLM only); "offline" now means the internet uplink is disconnected.
  - III. Resource Throttling: Ollama limits replaced by "at most one LLM request in flight";
    the LLM server's own limits are the operator's responsibility.
  - V. Decoupled, Containerized Architecture: host-native Ollama exception replaced by the
    self-hosted LLM server exception.
  - Local Stack Constraints / LiteLLM: backend configured from .env; lint checks provider and
    private api_base.
- Migration: Ollama removed from compose env, .env(.example), litellm config, docs; app alias
  `local-llm` kept, `deepseek-local` removed; scripts/lint-config.mjs checks LLM_MODEL/LLM_API_BASE.
- Deferred TODOs: none
-->
<!--
SYNC IMPACT REPORT (original)
- Version change: (unversioned template) → 1.0.0
- Modified principles (template placeholder → new title):
  - [PRINCIPLE_1_NAME] → I. Strict Local Execution (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Deterministic & Modular Compositions
  - [PRINCIPLE_3_NAME] → III. Resource Throttling
  - [PRINCIPLE_4_NAME] → IV. Tool-Driven 3D Generation via Blender MCP
  - [PRINCIPLE_5_NAME] → V. Decoupled, Containerized Architecture
- Added sections:
  - Local Stack Constraints (Remotion, LiteLLM, MinIO, Docker, Blender MCP)
  - Development Workflow & Quality Gates
  - Governance (filled)
- Removed sections: none
- Source: spec.md §2 "Project Constitution", hardened for strict 100% local operation.
- Known conflicts in spec.md that violate this constitution (spec must be amended):
  - litellm_config.yaml declares cloud model `gpt-4o-mini` with OPENAI_API_KEY (violates I, LiteLLM rules)
  - docker-compose.yml uses floating tags `minio/minio:latest`, `litellm:main-latest`,
    `blender-mcp:latest` (violates Docker pinning rule)
  - docker-compose.yml publishes ports on all interfaces and hardcodes credentials
    (violates Docker loopback-binding and secrets rules)
  - Backend queue lists BullMQ, which requires Redis, but no Redis service exists in compose
    (violates V: every runtime component defined in compose)
- Deferred TODOs: none
-->

# StoryFlow Constitution

## Core Principles

### I. Strict Local Execution (NON-NEGOTIABLE)

All asset storage, 3D generation, and video rendering MUST run on the host machine or in
containers on it. AI inference (text, image, and later voice or video) MUST run on the host or on
a self-hosted server on the owner's private network. The platform MUST be fully functional with the internet uplink disconnected
once images, models, and dependencies have been provisioned.

- No runtime dependency on cloud rendering (e.g., AWS Lambda, GCP Cloud Run, Remotion Lambda),
  hosted AI APIs for text, image, voice or video (OpenAI, Anthropic, Gemini, etc.), hosted 3D
  generators, or remote asset libraries.
- No code path MAY read a cloud provider API key or call a non-local endpoint. Every outbound URL in
  application config MUST resolve to `localhost`, `127.0.0.1`, `host.docker.internal`, or a
  docker-compose service name. The single exception is LiteLLM's model backends, which MAY be
  self-hosted servers at a private network address (RFC 1918, link-local, `.local`, `.lan`,
  `.home.arpa`, or a single-label LAN name); public hosts are forbidden.
- Telemetry, analytics, and auto-update checks MUST be disabled in every component
  (e.g., `NEXT_TELEMETRY_DISABLED=1`, LiteLLM telemetry off, Blender MCP telemetry off).
- Runtime downloads are forbidden: fonts, browser binaries, models, and codecs MUST be bundled or
  pre-provisioned at build/setup time, never fetched on first use.

Rationale: The product promise is a private, offline-capable creative studio; a single cloud
fallback silently breaks privacy, cost, and offline guarantees.

### II. Deterministic & Modular Compositions

- Remotion compositions MUST be pure functional React components whose only inputs are
  `inputProps` typed by an exported TypeScript interface (with a runtime schema, e.g., Zod).
- Given identical `inputProps` and assets, a composition MUST render identical frames. Use of
  `Math.random()`, `Date.now()`, network fetches, or unseeded randomness inside compositions is
  forbidden; use Remotion's seeded `random()` and frame-derived timing.
- All media referenced by a composition MUST come from MinIO or bundled static files, addressed
  by explicit props.

Rationale: Determinism makes previews trustworthy, renders reproducible, and regressions testable.

### III. Resource Throttling

- Rendering jobs MUST cap concurrency at a maximum of 4 CPU threads (`concurrency: 4` or lower in
  `renderMedia`), and the render queue MUST process at most one render job at a time unless a
  configured limit explicitly allows more within the same 4-thread budget.
- Blender workloads MUST have configured container CPU/memory limits. The application MUST keep
  at most one request in flight per LiteLLM alias (queue concurrency 1 per alias); the model
  servers' own resource limits are the operator's responsibility because they run outside compose. Long-running jobs MUST run
  through the async queue, never in request handlers.

Rationale: This runs on a creator's workstation; the host MUST stay responsive during processing.

### IV. Tool-Driven 3D Generation via Blender MCP

- All 3D scene generation MUST go through the Blender MCP server over its standardized
  HTTP/JSON-RPC interface. Direct shelling out to Blender or ad-hoc Python bridges from the
  application are forbidden.
- Only local Blender MCP capabilities (local `bpy` execution, scene inspection, local rendering)
  MAY be used. MCP tools that call external services — remote asset search/import (e.g., Poly Haven,
  Sketchfab, Poly Pizza) or hosted text/image-to-3D generation — MUST be disabled or blocked.
- 3D outputs MUST be written to MinIO and referenced by object key, never by local absolute path.

Rationale: A single, auditable tool interface keeps 3D generation swappable, observable, and local.

### V. Decoupled, Containerized Architecture

- Frontend preview, API orchestration, LLM proxy, asset storage, database, queue backend, and
  rendering workers MUST run as isolated services defined in `docker-compose.yml`.
- Services MUST communicate only through declared network interfaces (HTTP, S3 API, DB/queue
  protocols); shared filesystem coupling between services is forbidden except declared volumes.
- The only allowed components outside compose are self-hosted AI model servers (on the host or
  the private network), which MUST be reachable only through LiteLLM; no application service MAY
  call them directly.
- `docker compose up -d` from a clean checkout (with provisioned images/models) MUST bring up the
  full stack.

Rationale: Isolation keeps each component replaceable and makes the whole system reproducible.

## Local Stack Constraints

**Remotion**
- Rendering MUST use local `@remotion/renderer` with local FFmpeg; Remotion Lambda/Cloud Run
  packages MUST NOT be installed.
- The headless browser used by the renderer MUST be pre-installed in the render worker image
  (e.g., via `npx remotion browser ensure` at image build time).
- Fonts MUST be self-hosted files loaded locally; remote font loaders (e.g., Google Fonts URLs)
  are forbidden in compositions.

**LiteLLM**
- LiteLLM is the only entry point for every AI call: text, image, and later voice or video.
  Application code MUST target the LiteLLM base URL and MUST NOT import provider SDKs or call a
  model server directly. This holds even when no model is provisioned for a modality yet: the
  feature is built against its LiteLLM alias, not dropped or routed elsewhere.
- `litellm_config.yaml` MUST contain only self-hosted backends (on the host or the private
  network) and local MCP servers. Any cloud provider or cloud API key is a constitution violation.
- Each backend (provider/model, private `api_base`, the server's own key) MUST come from `.env`,
  and the config lint MUST reject cloud providers and public `api_base` hosts for every alias.
- The app MUST request only declared LiteLLM aliases: `local-llm` for text and `local-image` for
  image generation. A new modality needs a new alias declared here. Which model serves each alias
  is documented in `.env.example`.
- An alias MAY have no model behind it. When LiteLLM reports the model missing or cannot be
  reached, the app MUST show a clear "unavailable" state for that action and every feature that
  does not need it MUST keep working.

**MinIO**
- MinIO is the single system of record for binary assets (images, narration, 3D outputs, MP4s).
- Clients MUST use path-style addressing against the local endpoint; endpoints and credentials
  MUST come from environment variables, never hardcoded in source.
- Buckets MUST be created by an idempotent setup step, not manually.

**Docker**
- Every image MUST be pinned to an explicit version tag or digest; `latest`, `main-latest`, and
  other floating tags are forbidden.
- Published ports MUST bind to `127.0.0.1` only. No service MAY be exposed on `0.0.0.0`.
- Secrets (MinIO root credentials, LiteLLM master key, DB passwords) MUST be supplied via a
  git-ignored `.env` file, with a committed `.env.example` containing placeholders.
- Persistent data MUST live in named volumes.

**Blender MCP**
- The Blender MCP server MUST run headless in its own container (or as a documented local
  service), with telemetry disabled and external generator/asset providers turned off.
- MCP endpoints MUST be registered in LiteLLM by compose service name.

## Development Workflow & Quality Gates

- Every feature follows Spec Kit flow: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
  `/speckit-implement`. Each `plan.md` MUST include a Constitution Check against Principles I–V.
- An offline smoke test MUST pass before merge for any change touching rendering, AI, storage,
  or 3D: with outbound network blocked, the stack starts and a reference composition renders.
- Composition changes MUST include a deterministic render test (same `inputProps` → identical
  frame hashes for sampled frames).
- A config lint (script or CI check) MUST reject: cloud model entries for any alias in
  `litellm_config.yaml`,
  floating image tags, non-loopback port bindings, and hardcoded credentials in source.
- AI agents (e.g., Claude Code) working in this repo MUST NOT introduce cloud services,
  external API calls, or runtime downloads, even as optional fallbacks.

## Governance

- This constitution supersedes `spec.md`, plans, and all other practices. Where any artifact
  conflicts with it, the artifact MUST be amended; the constitution wins until then.
- Amendments require: a written proposal stating the change and rationale, an updated Sync Impact
  Report, a version bump, and a migration note for affected specs/plans/code.
- Versioning follows semantic versioning: MAJOR for removing or redefining a principle (any
  relaxation of Principle I is MAJOR); MINOR for new principles/sections or materially expanded
  rules; PATCH for clarifications and wording.
- Every plan, task list, and code review MUST verify compliance with Principles I–V and the Local
  Stack Constraints. Exceptions MUST be documented in the plan's Complexity Tracking with
  justification and are never permitted for Principle I.

**Version**: 3.0.0 | **Ratified**: 2026-11-04 | **Last Amended**: 2026-11-06
