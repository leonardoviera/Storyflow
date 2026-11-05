# Quickstart: Validating the Local Platform End-to-End

This guide shows the feature works once it is implemented. It covers prerequisites, how to run
the stack, and the expected result of each check. The interfaces are defined in
[contracts/](./contracts/) and the entities in [data-model.md](./data-model.md).

## Prerequisites (one-time, online)

Internet is needed only for this step. After it, everything runs offline.

1. Docker Engine 24+ or Docker Desktop with Compose v2. Give it 6 or more CPUs and 16 GB RAM.
2. Your self-hosted LLM server, reachable from this machine on your private network. Any
   OpenAI-compatible server works (vLLM, LM Studio, llama.cpp, TGI) as long as it supports
   `response_format: json_schema`. Set `LLM_MODEL`, `LLM_API_BASE` (a private address) and
   `LLM_API_KEY` in `.env`; LiteLLM exposes it to the app as `local-llm`.
3. Node.js 24 LTS and pnpm, for running tests on the host.
4. `cp .env.example .env` and replace every `CHANGE_ME`.
5. `docker compose build`. This downloads the base images, the Blender tarball (SHA-256
   checked), and Chrome Headless Shell, and builds the Remotion bundle.
6. `docker compose pull`. Then record image digests in `docker-compose.yml` (constitution
   pinning rule).

## Check 1: Config lint (constitution gate)

```bash
node scripts/lint-config.mjs
```
**Expected**: exit code 0. Then add a `gpt-4o-mini` entry to `infra/litellm/config.yaml`, or
change a port to `"4000:4000"`, and run it again. **Expected**: a non-zero exit that names the
violation.

## Check 2: Stack health

```bash
docker compose up -d
docker compose ps        # minio-init and db-migrate show "exited (0)"; others healthy/running
curl -s http://127.0.0.1:3000/api/health
```
**Expected**: `{"status":"ok","checks":{"postgres":"ok","minio":"ok","litellm":"ok","blenderMcp":"ok"}}`.
The buckets `storyflow-assets` and `remotion-videos` show up in the MinIO console at
http://127.0.0.1:9001.

**Loopback check**: From another machine on the LAN, ports 3000, 4000, 5432, 9000, and 9001
refuse connections.

## Check 3: Workers have no internet

```bash
docker compose exec render-worker node -e "fetch('https://example.com').then(()=>process.exit(1),()=>process.exit(0))"
docker compose exec blender-mcp python3 -c "import urllib.request,sys;\
exec('try:\n urllib.request.urlopen(\"https://example.com\",timeout=5);sys.exit(1)\nexcept Exception:sys.exit(0)')"
```
**Expected**: both exit with code 0, meaning the outbound request failed.

## Check 4: Prompt → script

Open http://127.0.0.1:3000, create a project, and enter a prompt (for example, "A 30-second
story about a lighthouse keeper who befriends a comet"), then click **Generate**. You can also
call `POST /api/projects/{id}/scripts/generate` directly (see [openapi.yaml](./contracts/openapi.yaml)).

**Expected**:
- The Job moves from QUEUED to RUNNING to SUCCEEDED.
- A `ScriptVersion` is created whose content passes [story-script.schema.json](./contracts/story-script.schema.json).
- Scenes appear in the editor.
- `docker compose logs litellm` shows requests only to the `local-llm` alias, served from `LLM_API_BASE` (a private address).

## Check 5: Blender MCP 3D asset

From a scene that has `asset3d`, or by calling `POST /api/projects/{id}/assets/3d` with
`render_text_logo` and `{ "text": "StoryFlow", ... }`:

**Expected**:
- The `ASSET_3D` Job succeeds within 120 s.
- An Asset of kind `RENDER_3D` becomes READY, with an object at
  `storyflow-assets/projects/{id}/RENDER_3D/...png`.
- Running the same params twice gives the same `sha256`.

## Check 6: Timeline editing and preview

Apply the script version. Drag a clip on the timeline, trim it, and add a TEXT clip.

**Expected**:
- The Player updates right away at about 30 fps.
- Reloading the page shows the saved layout.
- Saving from a second tab with an older revision returns **409**.

## Check 7: Local render (throttled)

Click **Render**, or call `POST /api/projects/{id}/renders`.

**Expected**:
- The `VIDEO_RENDER` Job reports progress.
- `docker stats` shows render-worker CPU at or below 400%.
- When it finishes, an H.264 MP4 is in `remotion-videos/projects/{id}/FINAL_RENDER/`, and the UI
  shows a download link.
- Sending POST again with no changes returns **200** with the existing Render (dedupe on hash).

## Check 8: Determinism

```bash
pnpm test:render     # tests/render: renders frames 0/mid/last of the `reference` template twice
```
**Expected**: the SHA-256 hashes of each frame pair match.

## Check 9: Offline gate (merge requirement)

Turn off the host's network (Wi-Fi off or cable unplugged), then:

```bash
scripts/offline-smoke.sh
```
**Expected**: the stack restarts, health is `ok`, script generation works (the LLM server is on the private network), and
the `reference` template renders to MinIO. The script exits with code 0.
