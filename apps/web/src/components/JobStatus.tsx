"use client";

import { api, isTerminal, type Job } from "@/lib/api";

const COLORS: Record<Job["status"], string> = {
  QUEUED: "text-slate-300",
  RUNNING: "text-sky-300",
  SUCCEEDED: "text-emerald-400",
  FAILED: "text-red-400",
  CANCELLED: "text-slate-500",
};

export function JobStatus({ job, cancellable = true }: { job: Job; cancellable?: boolean }) {
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-2">
        <span className={`font-semibold ${COLORS[job.status]}`}>{job.status}</span>
        {!isTerminal(job.status) && <span className="text-slate-400">{Math.round(job.progress * 100)}%</span>}
        <span className="flex-1" />
        {cancellable && !isTerminal(job.status) && (
          <button onClick={() => void api(`/jobs/${job.id}/cancel`, { method: "POST" }).catch(() => undefined)} className="rounded px-2 py-0.5 hover:bg-slate-800">
            Cancel
          </button>
        )}
      </div>
      {!isTerminal(job.status) && (
        <div className="h-1 rounded bg-slate-800">
          <div className="h-1 rounded bg-sky-500 transition-all" style={{ width: `${Math.max(2, job.progress * 100)}%` }} />
        </div>
      )}
      {job.error && <p className="whitespace-pre-wrap text-red-400">{job.error}</p>}
    </div>
  );
}
