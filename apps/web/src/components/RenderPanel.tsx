"use client";

import { useCallback, useEffect, useState } from "react";
import { useJob } from "@/hooks/useJob";
import { api, ApiError, type Render } from "@/lib/api";
import { JobStatus } from "./JobStatus";

export function RenderPanel({ projectId }: { projectId: string }) {
  const [renders, setRenders] = useState<Render[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await api<Render[]>(`/projects/${projectId}/renders`);
    setRenders(list);
    const running = list.find((r) => r.job.status === "QUEUED" || r.job.status === "RUNNING");
    if (running) setActiveJobId(running.job.id);
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const job = useJob(activeJobId, () => void refresh());

  const start = async () => {
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/renders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (res.status === 200) setMessage("Nothing changed since the last render — reusing it.");
      else if (res.status === 202) setActiveJobId(data.job.id);
      else throw new ApiError(res.status, data.error, data.issues);
      await refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? `${err.message}${err.issues.length ? ` (${err.issues.map((i) => i.path.join(".")).join(", ")})` : ""}` : String(err));
    }
  };

  const download = async (assetId: string) => {
    const { url } = await api<{ url: string }>(`/assets/${assetId}/url`);
    window.open(url, "_blank", "noopener");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={start} className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
          Render MP4
        </button>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Force re-render
        </label>
      </div>
      {message && <p className="text-xs text-slate-300">{message}</p>}
      {job && <JobStatus job={job} />}
      <ul className="space-y-1 text-xs">
        {renders.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded border border-slate-800 px-2 py-1">
            <span className="text-slate-400">{new Date(r.createdAt).toLocaleTimeString()}</span>
            <span>{r.job.status}</span>
            {r.renderMs && <span className="text-slate-500">{(r.renderMs / 1000).toFixed(1)} s</span>}
            <span className="flex-1" />
            {r.outputAssetId && (
              <button onClick={() => void download(r.outputAssetId!)} className="text-sky-400 hover:underline">
                Download
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
