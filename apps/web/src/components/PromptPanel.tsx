"use client";

import { useState } from "react";
import { useJob } from "@/hooks/useJob";
import { api, ApiError, type Job } from "@/lib/api";
import { JobStatus } from "./JobStatus";

export function PromptPanel({ projectId, initialPrompt, onGenerated }: { projectId: string; initialPrompt: string; onGenerated: () => void }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [duration, setDuration] = useState(30);
  const [auto3d, setAuto3d] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJob(jobId, (j) => j.status === "SUCCEEDED" && onGenerated());

  const generate = async () => {
    setError(null);
    try {
      const created = await api<Job>(`/projects/${projectId}/scripts/generate`, {
        method: "POST",
        json: { prompt, model: "local-llm", targetDurationSeconds: duration, autoRender3d: auto3d },
      });
      setJobId(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  const busy = job?.status === "QUEUED" || job?.status === "RUNNING";

  return (
    <div className="space-y-2 text-xs">
      <h3 className="text-sm font-semibold">Prompt → script (local LLM)</h3>
      <textarea
        value={prompt}
        maxLength={4000}
        rows={4}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="A 30-second story about a lighthouse keeper who befriends a comet"
        className="w-full rounded bg-slate-800 px-2 py-1 text-sm"
      />
      <div className="text-right text-slate-500">{prompt.length}/4000</div>
      <div className="flex flex-wrap items-center gap-3">
        <label>
          Target{" "}
          <input type="number" min={5} max={300} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-16 rounded bg-slate-800 px-2 py-1" /> s
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={auto3d} onChange={(e) => setAuto3d(e.target.checked)} /> auto 3D
        </label>
        <button disabled={!prompt.trim() || busy} onClick={generate} className="rounded bg-sky-500 px-3 py-1.5 font-semibold text-slate-950 disabled:opacity-50">
          Generate
        </button>
      </div>
      {error && <p className="text-red-400">{error}</p>}
      {job && <JobStatus job={job} />}
    </div>
  );
}
