import { z } from "zod";
import { AspectRatio } from "../breakdown/document";
import { BlenderToolName } from "../schemas/story-script";

// contracts/queue-jobs.md (001) + specs/002-script-first-breakdown/contracts/queue-jobs-delta.md

export const QUEUES = {
  scriptGenerate: "script.generate",
  asset3dRender: "asset3d.render",
  videoRender: "video.render",
  scriptWrite: "script.write",
  breakdownRun: "breakdown.run",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const ScriptGeneratePayload = z.object({
  jobId: z.string(),
  projectId: z.string(),
  prompt: z.string().min(1).max(4000),
  model: z.literal("local-llm"),
  targetDurationSeconds: z.number().int().min(5).max(300).optional(),
  autoRender3d: z.boolean(),
});

export const Asset3dRenderPayload = z.object({
  jobId: z.string(),
  projectId: z.string(),
  sceneId: z.string().optional(),
  assetId: z.string(),
  tool: BlenderToolName,
  params: z.record(z.string(), z.unknown()),
});

export const VideoRenderPayload = z.object({
  jobId: z.string(),
  projectId: z.string(),
  renderId: z.string(),
  compositionId: z.string(),
  inputPropsHash: z.string().length(64),
});

export const ScriptWritePayload = z.object({
  jobId: z.string(),
  projectId: z.string(),
  idea: z.string().min(1).max(4000),
  aspectRatio: AspectRatio,
  episodeSeconds: z.number().int().min(15).max(300),
  episodeCount: z.number().int().min(1).max(20),
});

export const BreakdownRunPayload = z
  .object({
    jobId: z.string(),
    projectId: z.string(),
    breakdownId: z.string(),
    mode: z.enum(["full", "episodes"]),
    episodeIds: z.array(z.string()).min(1).optional(),
  })
  .refine((p) => p.mode !== "episodes" || p.episodeIds !== undefined, {
    message: "episodeIds is required when mode is episodes",
    path: ["episodeIds"],
  });

export const QUEUE_PAYLOADS = {
  [QUEUES.scriptGenerate]: ScriptGeneratePayload,
  [QUEUES.asset3dRender]: Asset3dRenderPayload,
  [QUEUES.videoRender]: VideoRenderPayload,
  [QUEUES.scriptWrite]: ScriptWritePayload,
  [QUEUES.breakdownRun]: BreakdownRunPayload,
} as const;

export type QueuePayload<Q extends QueueName> = z.infer<(typeof QUEUE_PAYLOADS)[Q]>;

/** Retry / expiry per queue; `exclusive` = one queued-or-active job per singletonKey. */
export const QUEUE_OPTIONS: Record<
  QueueName,
  { retryLimit: number; retryBackoff: boolean; expireInSeconds: number; policy: "standard" | "exclusive" }
> = {
  [QUEUES.scriptGenerate]: { retryLimit: 2, retryBackoff: true, expireInSeconds: 600, policy: "exclusive" },
  [QUEUES.asset3dRender]: { retryLimit: 1, retryBackoff: false, expireInSeconds: 600, policy: "standard" },
  [QUEUES.videoRender]: { retryLimit: 1, retryBackoff: false, expireInSeconds: 3600, policy: "exclusive" },
  [QUEUES.scriptWrite]: { retryLimit: 1, retryBackoff: false, expireInSeconds: 600, policy: "exclusive" },
  // Episode-level retries are explicit (FR-011), so the queue never retries a breakdown.
  [QUEUES.breakdownRun]: { retryLimit: 0, retryBackoff: false, expireInSeconds: 3600, policy: "exclusive" },
};

export function singletonKeyFor<Q extends QueueName>(queue: Q, payload: QueuePayload<Q>): string | undefined {
  if (queue === QUEUES.scriptGenerate) return `script:${(payload as QueuePayload<"script.generate">).projectId}`;
  if (queue === QUEUES.videoRender) return `render:${(payload as QueuePayload<"video.render">).inputPropsHash}`;
  if (queue === QUEUES.scriptWrite) return `write:${(payload as QueuePayload<"script.write">).projectId}`;
  if (queue === QUEUES.breakdownRun) return `breakdown:${(payload as QueuePayload<"breakdown.run">).breakdownId}`;
  return undefined;
}
