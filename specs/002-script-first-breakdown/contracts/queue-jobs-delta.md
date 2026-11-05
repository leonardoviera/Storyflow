# Contract: Queue additions (pg-boss)

These extend `specs/001-local-video-platform/contracts/queue-jobs.md`. The payloads are Zod schemas
in `packages/shared/src/queue/payloads.ts`.

| Queue | Job type | Worker | localConcurrency | retryLimit | expireIn | policy / singletonKey |
|---|---|---|---|---|---|---|
| `script.write` | `SCRIPT_WRITE` | pipeline | 1 | 1 | 600 s | exclusive, `write:{projectId}` |
| `breakdown.run` | `BREAKDOWN` | pipeline | 1 | 0 (episode-level retries are explicit) | 3600 s | exclusive, `breakdown:{breakdownId}` |

## Payloads

```ts
ScriptWritePayload = {
  jobId: string; projectId: string;
  idea: string (1–4000);
  aspectRatio: "PORTRAIT_9_16" | "LANDSCAPE_16_9";
  episodeSeconds: int 15–300; episodeCount: int 1–20;
}

BreakdownRunPayload = {
  jobId: string; projectId: string; breakdownId: string;
  mode: "full" | "episodes";
  episodeIds?: string[];       // required when mode = "episodes" (retry, FR-011)
}
```

## Rules

- **One LLM call at a time.** Every LLM call in the pipeline worker (`script.generate`,
  `script.write`, `breakdown.run`) runs inside `withLlmSlot()`, so only one is in flight at a
  time (FR-032, constitution III). `pipeline-worker` MUST stay a single replica; compose
  documents this.
- **Queue position** is the count of `Job` rows with type ∈ {SCRIPT_GENERATION, SCRIPT_WRITE,
  BREAKDOWN} and status ∈ {QUEUED, RUNNING} that were created before this job.
- **`Job.progress`**:
  - the analyze pass = 0.1;
  - each episode then adds `0.9 / episodeCount`;
  - `Job.output.steps` mirrors per-step status for `GET /api/jobs/{id}`.
- **Cancellation** is checked before every LLM call. Episodes already written stay in the
  document. The status becomes `CANCELLED` for the breakdown and the job.
- **Failure**:
  - If the analyze pass fails, the breakdown becomes `FAILED`, the job fails and the readable
    reason goes into `Job.error`.
  - If an episode fails, that episode's `status` is `failed` with an `error`, and the run carries
    on. The final status is `PARTIAL`, and the job is still `SUCCEEDED`.
- **3D jobs from a timeline build** use the existing `asset3d.render` queue and payload, with
  `sceneId` unset and `params.width/height` taken from the aspect ratio.
