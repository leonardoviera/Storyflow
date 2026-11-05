# Technical Specification & Spec-Driven Development Plan: Local Storytelling & Video Automation Platform

## 1. Executive Summary & Product Vision

This specification defines a **100% local video storytelling, editing, and automation platform**. Built around **Spec-Driven Development (SDD)** principles (inspired by `github/spec-kit`), the system empowers creators to convert text prompts into rich audiovisual projects locally.

The platform orchestrates 2D motion graphics via **Remotion (React)**, 3D elements via **Blender MCP (Model Context Protocol)**, local AI capabilities through a **LiteLLM Gateway**, and S3-compatible asset management via **MinIO**.

---

## 2. Project Constitution (`constitution.md`)

These constitutional rules govern all code contributions, agent instructions (e.g., Claude Code), and architecture decisions:

1. **Strict Local Execution:** Zero dependencies on cloud rendering services (e.g., AWS Lambda, GCP Cloud Run) or required external APIs. All asset storage, LLM inference, 3D generation, and FFmpeg rendering MUST run locally.
2. **Deterministic & Modular Compositions:** Remotion components must be purely functional, parameterized via TypeScript interfaces, and render identically given the same `inputProps`.
3. **Resource Throttling:** Node.js rendering jobs must cap concurrency (maximum 4 CPU threads) to ensure host machine stability during processing.
4. **Tool-Driven 3D Generation:** 3D scene generation must exclusively communicate with Blender via the standardized Model Context Protocol (MCP) interface over HTTP/JSON-RPC.
5. **Decoupled Architecture:** Frontend preview, API orchestration, LLM proxy, asset storage, and rendering workers must run as isolated components defined in `docker-compose.yml`.

---

## 3. High-Level Architecture & Component Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Web Browser)                       │
│ Next.js + Tailwind CSS + @remotion/player + @dnd-kit (Timeline)   │
└─────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND / LOCAL API (Node.js)                │
│ Prisma ORM + Async Job Queue (pg-boss on PostgreSQL)             │
└────────┬────────────────────────┼───────────────────────┬────────┘
         │                        │                       │
         ▼                        ▼                       ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ LiteLLM Proxy    │    │ MinIO (Local S3) │    │ Blender MCP      │
│ • Self-hosted LLM│    │ • Assets & MP4s  │    │ • Headless 3D    │
│   (LAN server)   │    │   S3 Bucket      │    │   Rendering      │
└──────────────────┘    └─────────┬────────┘    └─────────┬────────┘
                                  │                       │
                                  ▼                       ▼
                        ┌──────────────────────────────────────────┐
                        │ Remotion Renderer (Local FFmpeg)         │
                        │ 2D Composition + 3D Rendered Assets      │
                        └──────────────────────────────────────────┘
```

---

## 4. System Components & Technology Stack

| Component | Layer / Tool | Primary Responsibility |
| :--- | :--- | :--- |
| **Frontend UI** | Next.js 15 (App Router), Tailwind CSS | Script creation interface, timeline manipulation, and project management. |
| **Video Player** | `@remotion/player` | In-browser real-time canvas preview of React compositions. |
| **AI Gateway** | **LiteLLM Proxy** | OpenAI-compatible API layer directing prompts to the self-hosted LLM server on the private network, and registry for MCP tools. |
| **Asset Storage** | **MinIO (Local S3)** | Local S3 storage for images, voice narration, rendered 3D models, and `.mp4` outputs. |
| **3D Rendering** | **Blender MCP Server** | Headless Blender execution engine triggered via MCP tool calls. |
| **Video Renderer**| `@remotion/renderer` + FFmpeg | Local CPU/GPU video compilation into H.264 `.mp4` files. |
| **Database** | PostgreSQL 16 | Persistence for project metadata, timelines, templates, job status, and the pg-boss job queue. |

---

## 5. Local Infrastructure Setup (`docker-compose.yml`)

The canonical compose file is [`docker-compose.yml`](docker-compose.yml) (designed in
`specs/001-local-video-platform/contracts/infra/`). Compared with the first draft of this spec:

- Every image is pinned (no `latest`). `minio/minio` was withdrawn from Docker Hub, so the
  `pgsty/minio` community build is used.
- Every published port binds to `127.0.0.1`. Secrets come from a git-ignored `.env`
  (see `.env.example`).
- Blender MCP is a self-built headless image (`services/blender-mcp`) with a closed tool list,
  and it shares no volumes with other services.
- The web app, the pipeline worker, the render worker and a one-shot migration job are compose
  services. Workers sit on an internal network with no internet egress.
- The job queue is pg-boss on PostgreSQL, so no Redis is needed.

---

## 6. LiteLLM & MCP Gateway Setup (`litellm_config.yaml`)

See [`infra/litellm/config.yaml`](infra/litellm/config.yaml). Only self-hosted backends are allowed:
the app requests the single alias `local-llm`, which LiteLLM maps to the owner's LLM server on the
private network (`LLM_MODEL`, `LLM_API_BASE`, `LLM_API_KEY` in `.env`; constitution v2.0.0). The `blender_mcp` server is registered by compose service name.
Cloud models such as `gpt-4o-mini` are forbidden by constitution Principle I and rejected by
`pnpm lint:config`.

---

## 7. Core Software Integration Code

The implementations live in the monorepo. Configuration comes only from environment variables,
validated by `packages/shared/src/env.ts`, which also rejects non-local hosts.

- **MinIO S3 client**: `packages/storage/src/client.ts`. Path-style addressing, an internal
  endpoint for services, and a public endpoint used only to sign browser URLs.
- **AI service and MCP**: `packages/shared/src/llm/` (LiteLLM-only client, schema-validated
  StoryScript generation) and `apps/worker/src/lib/mcp.ts` (Blender MCP tool calls).
- **Remotion renderer**: `apps/worker/src/lib/renderer.ts`. It uses a pre-built bundle (no
  `bundle()` at runtime) and `concurrency: min(RENDER_CONCURRENCY, 4)`.

---

## 8. SDD Implementation Plan (`plan.md` & `tasks.md`)

### Phase 1: Environment & Container Setup
- [ ] Install `specify-cli` via `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git`.
- [ ] Initialize project with `specify init --integration claude`.
- [ ] Run `docker compose up -d` and verify ports `9000` (MinIO), `4000` (LiteLLM), and `8000` (Blender MCP).
- [ ] Create the bucket `remotion-videos` in MinIO (`http://localhost:9001`).

### Phase 2: Core Frontend & Remotion Preview
- [ ] Set up Next.js App Router with TypeScript and Tailwind CSS.
- [ ] Install `@remotion/player`, `@remotion/bundler`, and `@remotion/renderer`.
- [ ] Build a basic 2D composition component (`src/remotion/Composition.tsx`).
- [ ] Embed `@remotion/player` in a Next.js dashboard page with editable props.

### Phase 3: AI Script Generation & Blender MCP Integration
- [ ] Integrate LiteLLM client to send prompts and parse JSON video scripts.
- [ ] Connect Blender MCP tool calls for rendering basic 3D overlays/logos.
- [ ] Save generated 3D render outputs directly to MinIO.

### Phase 4: Offline Queue & Rendering Pipeline
- [ ] Create a Node.js API route `/api/render` that enqueues rendering tasks.
- [ ] Implement `renderVideoLocally` worker script with CPU throttling (`concurrency: 4`).
- [ ] Upload final MP4 output to MinIO S3 and surface download link in Next.js UI.