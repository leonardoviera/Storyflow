# StoryFlow

A **100% local** video storytelling studio. You type a prompt, a local LLM writes a script,
headless Blender renders 3D elements, you edit on a timeline with a live Remotion preview, and the
final MP4 is rendered on your own machine. No cloud services, API keys or telemetry are involved,
and nothing is downloaded at run time (see the [constitution](.specify/memory/constitution.md)).

```
Browser (Next.js 15 · @remotion/player · @dnd-kit timeline)
   │  http://127.0.0.1:3000
   ▼
web (Next.js route handlers) ──► Postgres 16 (metadata + pg-boss queue)
   │                         └─► MinIO (assets + MP4s, presigned URLs)
   ▼ pg-boss
pipeline-worker ──► LiteLLM ──► your LLM server (self-hosted, private network)
      │               └─► MCP gateway ──► blender-mcp (headless Blender 4.3, closed tool list)
render-worker ──► Remotion renderer (pre-built bundle, baked Chrome Headless Shell, ≤ 4 threads)
```

The worker services (`render-worker`, `pipeline-worker` and `blender-mcp`) sit on an internal
Docker network with **no route to the internet**.

## Prerequisites (one-time, online)

1. Docker with Compose v2. Allow 6 or more CPUs and 16 GB RAM.
2. Your self-hosted LLM server, reachable from this machine on your private network. Any
   OpenAI-compatible server works (vLLM, LM Studio, llama.cpp, TGI) as long as it supports
   `response_format: json_schema`. Set `LLM_MODEL`, `LLM_API_BASE` (a private address) and
   `LLM_API_KEY` in `.env`; LiteLLM exposes it to the app as `local-llm`.
3. Node.js 24 and pnpm (`corepack enable`), for host-side tests and development.
4. `cp .env.example .env` and replace every `CHANGE_ME`.
5. `docker compose build`. This pulls the base images and bakes in Blender, Chrome Headless Shell
   and the Remotion bundle.

After this step, everything runs offline.

## Run

```bash
docker compose up -d
open http://127.0.0.1:3000
```

| Service | URL (loopback only) |
|---|---|
| App | http://127.0.0.1:3000 |
| MinIO console | http://127.0.0.1:9001 |
| LiteLLM | http://127.0.0.1:4000 |
| Postgres | 127.0.0.1:5432 |

## Constitution gates (required before merge)

```bash
pnpm lint:config            # pinned images, loopback ports, no cloud models or keys, no hardcoded secrets
pnpm test                   # unit tests (timeline rules, props hashing)
pnpm test:render            # deterministic frame-hash test inside the render-worker image
scripts/offline-smoke.sh    # host offline: health, egress blocked, reference render → MinIO
```

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js UI and `/api` ([OpenAPI](specs/001-local-video-platform/contracts/openapi.yaml)) |
| `apps/worker` | pg-boss workers: `pipeline.ts` (LLM and 3D), `render.ts` (Remotion) |
| `packages/shared` | Zod schemas, timeline rules, canonical props, LiteLLM client |
| `packages/db` | Prisma 7 schema and migrations, pg-boss wrapper, job state machine |
| `packages/storage` | MinIO client, presigning, prop resolution |
| `packages/compositions` | Remotion `StoryComposition` and self-hosted fonts |
| `services/blender-mcp` | Python MCP server driving headless Blender |
| `specs/001-local-video-platform` | Spec, plan, research, data model, contracts, tasks |

## Licensing notes

- **Remotion** is source-available. It is free for individuals and for companies of up to
  3 people; larger companies need a [company license](https://remotion.pro/license).
- **MinIO** (AGPL-3.0) runs from the community `pgsty/minio` build, because the upstream Docker
  Hub images were withdrawn (see research R2).
- The bundled fonts (Inter, Merriweather, JetBrains Mono) are under the SIL Open Font License; the
  license texts sit next to the font files.
