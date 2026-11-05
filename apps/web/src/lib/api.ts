// Typed client for contracts/openapi.yaml (browser side).
import type { ClipProps, StoryCompositionProps, StoryScript, TrackKind } from "@storyflow/shared/schemas";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly issues: { path: (string | number)[]; message: string }[] = [],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText, data.issues ?? []);
  return data as T;
}

export interface Project {
  id: string;
  title: string;
  prompt: string | null;
  compositionId: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  currentScriptVersionId: string | null;
  timelineRevision: number;
  updatedAt: string;
}

export interface Template {
  id: string;
  slug: string;
  name: string;
}

export interface Clip {
  id: string;
  sceneId?: string | null;
  assetId: string | null;
  startFrame: number;
  durationInFrames: number;
  trimStartFrame: number;
  props: ClipProps;
}

export interface Track {
  id: string;
  kind: TrackKind;
  order: number;
  muted: boolean;
  locked: boolean;
  clips: Clip[];
}

export interface Timeline {
  revision: number;
  durationInFrames: number;
  tracks: Track[];
  previewProps: StoryCompositionProps;
}

export type AssetKind = "IMAGE" | "VIDEO" | "AUDIO" | "MODEL_3D" | "RENDER_3D" | "FONT" | "FINAL_RENDER";

export interface Asset {
  id: string;
  kind: AssetKind;
  status: "PENDING" | "READY" | "FAILED";
  source: string;
  mimeType: string;
  objectKey: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  metadata: { filename?: string; tool?: string; sceneId?: string | null };
  createdAt: string;
}

export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface Job {
  id: string;
  type: "SCRIPT_GENERATION" | "ASSET_3D" | "VIDEO_RENDER";
  status: JobStatus;
  progress: number;
  output: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
}

export interface Render {
  id: string;
  job: Job;
  inputPropsHash: string;
  outputAssetId: string | null;
  renderMs: number | null;
  createdAt: string;
}

export interface Scene {
  id: string;
  order: number;
  title: string;
  narration: string;
  durationInFrames: number;
}

export interface ScriptVersion {
  id: string;
  version: number;
  source: "LLM" | "MANUAL";
  model: string | null;
  content: StoryScript;
  scenes: Scene[];
  createdAt: string;
}

export const isTerminal = (s: JobStatus) => s === "SUCCEEDED" || s === "FAILED" || s === "CANCELLED";
