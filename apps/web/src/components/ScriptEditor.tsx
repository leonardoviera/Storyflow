"use client";

import { useCallback, useEffect, useState } from "react";
import type { StoryScript } from "@storyflow/shared/schemas";
import { api, ApiError, type ScriptVersion } from "@/lib/api";

interface Props {
  projectId: string;
  refreshKey: number;
  timelineHasClips: boolean;
  onApplied: () => void;
}

export function ScriptEditor({ projectId, refreshKey, timelineHasClips, onApplied }: Props) {
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<StoryScript | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await api<ScriptVersion[]>(`/projects/${projectId}/scripts`);
    setVersions(list);
    const first = list[0];
    if (first) {
      setSelected(first.version);
      setDraft(structuredClone(first.content));
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const pick = (version: number) => {
    const v = versions.find((x) => x.version === version);
    setSelected(version);
    setDraft(v ? structuredClone(v.content) : null);
  };

  const editScene = (i: number, patch: Partial<StoryScript["scenes"][number]>) =>
    setDraft((d) => (d ? { ...d, scenes: d.scenes.map((s, k) => (k === i ? { ...s, ...patch } : s)) } : d));

  const saveVersion = async () => {
    setError(null);
    try {
      const created = await api<ScriptVersion>(`/projects/${projectId}/scripts`, { method: "POST", json: draft });
      await load();
      pick(created.version);
    } catch (err) {
      setError(err instanceof ApiError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") || err.message : String(err));
    }
  };

  const apply = async () => {
    setConfirming(false);
    setError(null);
    try {
      await api(`/projects/${projectId}/scripts/${selected}/apply`, { method: "POST" });
      onApplied();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  if (!versions.length || !draft) return <p className="text-xs text-slate-500">No script yet — generate one from a prompt.</p>;

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Script</h3>
        <select value={selected ?? ""} onChange={(e) => pick(Number(e.target.value))} className="rounded bg-slate-800 px-2 py-1">
          {versions.map((v) => (
            <option key={v.id} value={v.version}>
              v{v.version} · {v.source}
              {v.model ? ` · ${v.model}` : ""}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <button onClick={saveVersion} className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700">
          Save as new version
        </button>
        <button
          onClick={() => (timelineHasClips ? setConfirming(true) : void apply())}
          className="rounded bg-sky-500 px-2 py-1 font-semibold text-slate-950"
        >
          Apply to timeline
        </button>
      </div>
      {confirming && (
        <div className="flex items-center gap-2 rounded border border-amber-500/50 bg-amber-500/10 p-2">
          <span className="flex-1">This replaces the current timeline. Continue?</span>
          <button onClick={() => void apply()} className="rounded bg-amber-500 px-2 py-1 font-semibold text-slate-950">
            Replace
          </button>
          <button onClick={() => setConfirming(false)} className="rounded px-2 py-1 hover:bg-slate-800">
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-red-400">{error}</p>}
      <div className="font-semibold">{draft.title}</div>
      <p className="text-slate-400">{draft.logline}</p>
      <ol className="space-y-2">
        {draft.scenes.map((s, i) => (
          <li key={i} className="space-y-1 rounded border border-slate-800 p-2">
            <div className="flex gap-2">
              <input value={s.title} maxLength={120} onChange={(e) => editScene(i, { title: e.target.value })} className="flex-1 rounded bg-slate-800 px-2 py-1 font-semibold" />
              <input
                type="number"
                min={1}
                max={60}
                value={s.durationSeconds}
                onChange={(e) => editScene(i, { durationSeconds: Number(e.target.value) })}
                className="w-16 rounded bg-slate-800 px-2 py-1"
                title="seconds"
              />
              <select value={s.transition} onChange={(e) => editScene(i, { transition: e.target.value as typeof s.transition })} className="rounded bg-slate-800 px-1">
                {["cut", "fade", "slide", "wipe"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <input
              value={s.onScreenText ?? ""}
              maxLength={200}
              placeholder="On-screen text"
              onChange={(e) => editScene(i, { onScreenText: e.target.value || undefined })}
              className="w-full rounded bg-slate-800 px-2 py-1"
            />
            <textarea value={s.narration} maxLength={2000} rows={2} onChange={(e) => editScene(i, { narration: e.target.value })} className="w-full rounded bg-slate-800 px-2 py-1 text-slate-300" />
            {s.asset3d && <div className="text-violet-300">3D: {s.asset3d.tool}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}
