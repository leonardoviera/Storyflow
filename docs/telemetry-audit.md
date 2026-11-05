# Telemetry & outbound-connection audit (T091)

**Date**: 2026-11-04. **Stack**: `docker compose up` with images pinned by digest.

| Component | Setting | Verified |
|---|---|---|
| web (Next.js) | `NEXT_TELEMETRY_DISABLED=1` | present in the container env |
| web, workers (Prisma) | `CHECKPOINT_DISABLE=1` | present in the container env |
| LiteLLM | `LITELLM_LOCAL_MODEL_COST_MAP=True` (no fetch of the GitHub price list at startup) | present in the container env |
| LiteLLM | `litellm_settings.telemetry: false` | `infra/litellm/config.yaml:22` |
| pg-boss | OpenTelemetry is a no-op unless an SDK is registered (none is) | pg-boss 12 docs and types |
| Remotion | No telemetry. Chrome Headless Shell and the bundle are baked in at image build | `apps/worker/Dockerfile` |
| Blender | `--factory-startup`; no add-ons, no online asset or generator tools | `services/blender-mcp/server` |

## Network isolation (measured)

From inside `render-worker`, `pipeline-worker` and `blender-mcp`, outbound requests to the public
internet fail with DNS errors (`EAI_AGAIN` / `URLError`). These services are attached only to the
`internal: true` network.

## Log scan

`docker compose logs litellm web` contains no connection attempts to telemetry, analytics or
update endpoints. The only GitHub URL is LiteLLM's static startup banner text ("Give Feedback /
Get Help"); it is printed, not requested.

## Not covered

- Running the stack with the host's network physically disconnected (quickstart Check 9 /
  `scripts/offline-smoke.sh`) is still to be done on the target machine.
- The self-hosted LLM server on the private network is outside compose and not audited here.
