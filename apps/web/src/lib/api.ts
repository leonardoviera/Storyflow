// Typed client for contracts/openapi.yaml (browser side) + specs/002 contracts/openapi-delta.yaml.
import type { BreakdownDocument, Flag, ScriptSettings } from "@storyflow/shared/breakdown";
import type { ClipProps, StoryCompositionProps, StoryScript, TrackKind } from "@storyflow/shared/schemas";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly issues: { path: (string | number)[]; message: string }[] = [],
    /** Stable error code from the server (e.g. NOT_UTF8), when it sends one. */
    public readonly code?: string,
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
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText, data.issues ?? [], data.code);
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
  kind: "STANDARD" | "EPISODE";
  currentBreakdownId: string | null;
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

export type AssetKind = "IMAGE" | "VIDEO" | "AUDIO" | "MODEL_3D" | "RENDER_3D" | "FONT" | "FINAL_RENDER" | "DOCUMENT";

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
  type: "SCRIPT_GENERATION" | "ASSET_3D" | "VIDEO_RENDER" | "SCRIPT_WRITE" | "BREAKDOWN";
  status: JobStatus;
  progress: number;
  output: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  /** LLM jobs ahead of this one; null when running or finished (FR-032). */
  queuePosition?: number | null;
  steps?: JobStep[];
}

export interface JobStep {
  key: string;
  status: "pending" | "running" | "done" | "failed";
  error: string | null;
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

// --- Script-first breakdown (spec 002) -------------------------------------------------------

export interface ProjectScript extends ScriptSettings {
  id: string;
  projectId: string;
  text: string;
  origin: "PASTE" | "UPLOAD" | "GENERATED";
  idea: string | null;
  sourceAssetId: string | null;
  revision: number;
  wordCount: number;
  updatedAt: string;
}

export interface ScriptUploadResult {
  text: string;
  wordCount: number;
  sourceAssetId: string;
}

export type BreakdownStatus = "RUNNING" | "READY" | "PARTIAL" | "FAILED" | "CANCELLED";

export interface BreakdownSummary {
  version: number;
  status: BreakdownStatus;
  isCurrent: boolean;
  createdAt: string;
}

export interface Breakdown extends BreakdownSummary {
  revision: number;
  jobId: string | null;
  settings: ScriptSettings & { fps: number; analysis?: { speakerMap: Record<string, string>; maxSensibleEpisodes: number } };
  document: BreakdownDocument;
  flags: Flag[];
}

export const createProject = (input: { title: string; start: "script" | "empty_timeline"; width?: number; height?: number; fps?: number; templateSlug?: string }) =>
  api<Project>("/projects", { method: "POST", json: input });

export const getProject = (projectId: string) => api<Project>(`/projects/${projectId}`);

export const getScript = (projectId: string) => api<ProjectScript>(`/projects/${projectId}/script`);

export const putScript = (
  projectId: string,
  input: ScriptSettings & { baseRevision: number; text: string; origin?: ProjectScript["origin"]; sourceAssetId?: string | null },
) => api<ProjectScript>(`/projects/${projectId}/script`, { method: "PUT", json: input });

export function uploadScript(projectId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return api<ScriptUploadResult>(`/projects/${projectId}/script/upload`, { method: "POST", body: form });
}

export const startBreakdown = (projectId: string) =>
  api<{ jobId: string; version: number }>(`/projects/${projectId}/breakdowns`, { method: "POST" });

export const listBreakdowns = (projectId: string) => api<BreakdownSummary[]>(`/projects/${projectId}/breakdowns`);

export const getBreakdown = (projectId: string, version: number) =>
  api<Breakdown>(`/projects/${projectId}/breakdowns/${version}`);

export const retryBreakdownEpisode = (projectId: string, version: number, episodeId: string) =>
  api<{ jobId: string }>(`/projects/${projectId}/breakdowns/${version}/episodes/${episodeId}/retry`, { method: "POST" });

export const cancelJob = (jobId: string) => api<Job>(`/jobs/${jobId}/cancel`, { method: "POST" });
