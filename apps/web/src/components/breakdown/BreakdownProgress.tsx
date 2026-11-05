"use client";

import type { Episode } from "@storyflow/shared/breakdown";
import { useJob } from "@/hooks/useJob";
import { cancelJob, type Job, type JobStep } from "@/lib/api";

const STEP_STYLE: Record<JobStep["status"], string> = {
  pending: "text-slate-500",
  running: "text-sky-300",
  done: "text-emerald-400",
  failed: "text-red-400",
};
const STEP_ICON: Record<JobStep["status"], string> = { pending: "○", running: "◌", done: "●", failed: "✕" };

/** Live progress of a breakdown job: queue position, per-step status, cancel and retry (FR-011). */
export function BreakdownProgress({
  jobId,
  episodes,
  onDone,
  onRetry,
}: {
  jobId: string;
  episodes: Episode[];
  onDone: (job: Job) => void;
  onRetry: (episodeId: string) => void;
}) {
  const job = useJob(jobId, onDone);
  if (!job) return <p className="text-sm text-slate-400">Loading progress…</p>;

  const active = job.status === "QUEUED" || job.status === "RUNNING";
  const labelFor = (key: string) => {
    if (key === "analyze") return "Analyze the script";
    const ep = episodes.find((e) => e.id === key);
    return ep ? `Episode ${ep.order}${ep.title ? `: ${ep.title}` : ""}` : "Episode";
  };
  const steps = job.steps ?? [];

  return (
    <div className="space-y-3 rounded border border-slate-800 bg-slate-900/60 p-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">
            {job.status === "QUEUED" && "Waiting for the AI server"}
            {job.status === "RUNNING" && "Breaking down the script…"}
            {job.status === "SUCCEEDED" && "Breakdown finished"}
            {job.status === "FAILED" && "Breakdown failed"}
            {job.status === "CANCELLED" && "Breakdown cancelled"}
          </p>
          {job.status === "QUEUED" && typeof job.queuePosition === "number" && (
            <p className="text-xs text-slate-400">
              {job.queuePosition === 0 ? "Next in line" : `${job.queuePosition} AI job(s) ahead of this one`}
            </p>
          )}
        </div>
        {active && (
          <button type="button" onClick={() => void cancelJob(jobId)} className="rounded bg-slate-800 px-3 py-1 text-slate-200 hover:bg-slate-700">
            Cancel
          </button>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded bg-slate-800">
        <div className="h-full bg-sky-500 transition-all" style={{ width: `${Math.round(job.progress * 100)}%` }} />
      </div>
      {steps.length > 0 && (
        <ul className="space-y-1">
          {steps.map((s) => (
            <li key={s.key} className={`flex items-start gap-2 ${STEP_STYLE[s.status]}`}>
              <span aria-hidden>{STEP_ICON[s.status]}</span>
              <span className="flex-1">
                {labelFor(s.key)}
                {s.error && <span className="block text-xs text-red-300">{s.error}</span>}
              </span>
              {s.status === "failed" && s.key !== "analyze" && !active && (
                <button type="button" onClick={() => onRetry(s.key)} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-700">
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {job.status === "FAILED" && job.error && (
        <p className="text-red-300">
          {job.error}
          {job.error.includes("AI server unavailable") && " Your script was saved; try again when the AI server is back."}
        </p>
      )}
    </div>
  );
}
