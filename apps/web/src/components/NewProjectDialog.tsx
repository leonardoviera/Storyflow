"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type Project, type Template } from "@/lib/api";

const PRESETS = [
  { label: "1080p landscape", width: 1920, height: 1080 },
  { label: "1080p vertical", width: 1080, height: 1920 },
  { label: "Square", width: 1080, height: 1080 },
  { label: "720p", width: 1280, height: 720 },
];

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [title, setTitle] = useState("");
  const [templateSlug, setTemplateSlug] = useState("");
  const [preset, setPreset] = useState(0);
  const [fps, setFps] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Template[]>("/templates").then(setTemplates).catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { width, height } = PRESETS[preset]!;
      const project = await api<Project>("/projects", {
        method: "POST",
        json: { title, width, height, fps, ...(templateSlug ? { templateSlug } : {}) },
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.issues.map((i) => i.message).join("; ") || err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-lg font-bold">New project</h2>
        <label className="block text-sm">
          Title
          <input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded bg-slate-800 px-3 py-2" />
        </label>
        <label className="block text-sm">
          Template
          <select value={templateSlug} onChange={(e) => setTemplateSlug(e.target.value)} className="mt-1 w-full rounded bg-slate-800 px-3 py-2">
            <option value="">Blank</option>
            {templates.map((t) => (
              <option key={t.id} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-3">
          <label className="block flex-1 text-sm">
            Format
            <select value={preset} onChange={(e) => setPreset(Number(e.target.value))} disabled={!!templateSlug} className="mt-1 w-full rounded bg-slate-800 px-3 py-2">
              {PRESETS.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label} ({p.width}×{p.height})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            FPS
            <select value={fps} onChange={(e) => setFps(Number(e.target.value))} disabled={!!templateSlug} className="mt-1 w-full rounded bg-slate-800 px-3 py-2">
              {[24, 25, 30, 60].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-slate-300 hover:bg-slate-800">
            Cancel
          </button>
          <button disabled={busy} className="rounded bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
