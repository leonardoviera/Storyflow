import { z } from "zod";
import { BlenderToolName } from "../schemas/story-script";

// contracts/queue-jobs.md

export const QUEUES = {
  scriptGenerate: "script.generate",
  asset3dRender: "asset3d.render",
  videoRender: "video.render",
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

export const QUEUE_PAYLOADS = {
  [QUEUES.scriptGenerate]: ScriptGeneratePayload,
  [QUEUES.asset3dRender]: Asset3dRenderPayload,
  [QUEUES.videoRender]: VideoRenderPayload,
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
};

export function singletonKeyFor<Q extends QueueName>(queue: Q, payload: QueuePayload<Q>): string | undefined {
  if (queue === QUEUES.scriptGenerate) return `script:${(payload as QueuePayload<"script.generate">).projectId}`;
  if (queue === QUEUES.videoRender) return `render:${(payload as QueuePayload<"video.render">).inputPropsHash}`;
  return undefined;
}
