# Contract: pg-boss Queues

pg-boss 12 runs in the `pgboss` schema of the app's Postgres. Every payload is checked by a Zod
schema in `packages/shared/queue` on both send and receive. Every payload carries the app's
`jobId` (a `Job.id`). Workers update the `Job` row: status, `progress` (throttled to at most
one write per second), `output`, and `error`.

| Queue | Producer | Consumer | Local concurrency | Retry | Expire |
|---|---|---|---|---|---|
| `script.generate` | web `POST /projects/{id}/scripts/generate` | pipeline-worker | 1 | 2, backoff | 10 min |
| `asset3d.render` | pipeline-worker (after script) or web `POST /projects/{id}/assets/3d` | pipeline-worker → Blender MCP | 1 | 1 | 10 min |
| `video.render` | web `POST /projects/{id}/renders` | render-worker | **1** (constitution III) | 1 | 60 min |

`singletonKey` stops duplicate active jobs: `script:{projectId}` and `render:{inputPropsHash}`.

## Payloads

```ts
// script.generate
{ jobId: string; projectId: string; prompt: string; model: "local-llm";
  targetDurationSeconds?: number; autoRender3d: boolean }

// asset3d.render
{ jobId: string; projectId: string; sceneId?: string; assetId: string;   // pre-created PENDING Asset
  tool: "render_text_logo" | "render_primitive_scene" | "render_turntable";
  params: Record<string, unknown> }                                      // validated vs tool inputSchema

// video.render
{ jobId: string; projectId: string; renderId: string; compositionId: string;
  inputPropsHash: string }                                               // props read from Render row
```

## Handler outcomes

- **`script.generate`**:
  1. LiteLLM call with the StoryScript `response_format`.
  2. Zod validation, with up to 2 repair turns.
  3. Create `ScriptVersion` and `Scene` rows.
  4. If `autoRender3d` is set, create a PENDING `Asset` and an `asset3d.render` job for each
     scene with `asset3d`.
  5. Output: `{ scriptVersionId, sceneCount, asset3dJobIds }`.
- **`asset3d.render`**: Call the MCP tool, check the object exists in MinIO (HEAD), compare the
  sha256, then set the Asset to READY. On failure, set the Asset to FAILED.
- **`video.render`**:
  1. Load the Render row and resolve the props using internal-endpoint URLs.
  2. `selectComposition` → `renderMedia({ codec: "h264", concurrency: min(RENDER_CONCURRENCY, 4) })`
     writing to a tmp file. Progress comes from `onProgress`.
  3. Upload to `remotion-videos/projects/{projectId}/FINAL_RENDER/{assetId}.mp4`.
  4. Create a `FINAL_RENDER` Asset and set `Render.outputAssetId`.
- **Cancellation**: `POST /jobs/{id}/cancel` calls `boss.cancel(queueJobId)` and sets the Job to
  CANCELLED. A running render watches for this through Remotion's `cancelSignal`.
