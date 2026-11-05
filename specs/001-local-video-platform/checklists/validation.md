# Validation record: quickstart.md checks

**Run**: 2026-11-04, on a Windows 11 host with Docker 29.7.2 (22 CPUs, 16 GB). The stack ran on
`127.0.0.1:3001` (web) and `:4001` (LiteLLM) because 3000 and 4000 were taken on this host. See
`WEB_HOST_PORT` / `LITELLM_HOST_PORT` in `.env.example`.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Config lint | PASS | `pnpm lint:config` exits 0; a planted `openai/gpt-4o-mini` + `api_key` was rejected with `file:line` |
| 2 | Stack health | PASS | `/api/health` → all four `ok`; `minio-init` and `db-migrate` exited 0; every port is `127.0.0.1:` |
| 3 | Workers have no internet | PASS | render-worker / pipeline-worker `EAI_AGAIN`, blender-mcp `URLError` |
| 4 | Prompt → script (real LLM) | PASS | `ollama_chat/gpt-oss:20b` on a LAN server via LiteLLM `local-llm`: 5-scene schema-valid script in 30 s (1 attempt), applied to the timeline. With `autoRender3d`: 2 Blender jobs auto-queued and READY, MP4 rendered with both overlays (frames inspected). Earlier: 409 while active, clean FAILED after 3 attempts with no server |
| 5 | Blender MCP 3D asset | PASS | `render_text_logo` READY in 30 s; identical params → identical sha256; animated WebM (30 frames) in 82 s via direct MCP route; visually inspected |
| 6 | Timeline editing and preview | PARTIAL | API: save → revision+1, stale save → 409, overlap/kind → 422, previewProps carry public URLs. The browser UI was not exercised (Chrome extension not connected) |
| 7 | Local render (throttled) | PASS | 150-frame 1080p H.264 in 6.5 s; render-worker CPU peak 386.8% (≤ 400%); MP4 at `remotion-videos/projects/{id}/FINAL_RENDER/`; unchanged re-POST → 200 (dedupe) |
| 7b | 3D overlay compositing | PASS | PNG logo + transparent WebM on an OVERLAY_3D track rendered into the MP4; frames inspected |
| 8 | Determinism | PASS | `pnpm test:render`: frames 0/74/149 hash identically across two renders (in the offline worker image) |
| 9 | Offline gate | PARTIAL | `scripts/offline-smoke.sh` passes (health, egress blocked, reference render → MinIO). Not yet repeated with the host network physically disconnected |

## Findings fixed during validation

- Debian Blender 4.3 needs libEGL even with `-b`, so Mesa software EGL was added to the image.
- LiteLLM's MCP gateway cancels tool calls after about 60 s, so `MCP_ROUTE=direct` was set (research R8).
- Jobs showed FAILED between pg-boss retries; they now show QUEUED ("Retrying after error…") until the final attempt.
- Host ports 3000 and 4000 were in use, so the host ports were made configurable.
