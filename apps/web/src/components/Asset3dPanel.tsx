"use client";

import { useState } from "react";
import { useJob } from "@/hooks/useJob";
import { api, ApiError, type Asset, type Job } from "@/lib/api";
import { JobStatus } from "./JobStatus";

type Tool = "render_text_logo" | "render_primitive_scene" | "render_turntable";

const PRIMITIVE_EXAMPLE = JSON.stringify(
  {
    objects: [
      { shape: "SPHERE", location: [0, 0, 0], rotation: [0, 0, 0], scale: [1.2, 1.2, 1.2], color: "#FDE68A" },
      { shape: "TORUS", location: [0, 0, 0], rotation: [70, 0, 0], scale: [2.2, 2.2, 2.2], color: "#38BDF8" },
    ],
    camera: { location: [0, -6, 1.5], lookAt: [0, 0, 0], lensMm: 50 },
    lighting: "NIGHT",
  },
  null,
  2,
);

export function Asset3dPanel({ projectId, models, onDone }: { projectId: string; models: Asset[]; onDone: () => void }) {
  const [tool, setTool] = useState<Tool>("render_text_logo");
  const [text, setText] = useState("StoryFlow");
  const [fontFamily, setFontFamily] = useState("Inter");
  const [color, setColor] = useState("#38BDF8");
  const [metallic, setMetallic] = useState(0.6);
  const [animated, setAnimated] = useState(false);
  const [frames, setFrames] = useState(90);
  const [sceneJson, setSceneJson] = useState(PRIMITIVE_EXAMPLE);
  const [modelKey, setModelKey] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJob(jobId, () => onDone());

  const params = (): Record<string, unknown> => {
    const output = animated ? "ANIMATION_WEBM" : "STILL_PNG";
    if (tool === "render_text_logo") return { text, fontFamily, color: color.toUpperCase(), metallic, roughness: 0.3, extrude: 0.15, output, frames: animated ? frames : 1 };
    if (tool === "render_primitive_scene") return { ...JSON.parse(sceneJson), output, frames: animated ? frames : 1 };
    return { modelAssetKey: modelKey, frames: Math.max(24, frames) };
  };

  const submit = async () => {
    setError(null);
    try {
      const created = await api<Job>(`/projects/${projectId}/assets/3d`, { method: "POST", json: { tool, params: params() } });
      setJobId(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") || err.message : String(err));
    }
  };

  return (
    <div className="space-y-2 text-xs">
      <h3 className="text-sm font-semibold">3D via Blender MCP</h3>
      <select value={tool} onChange={(e) => setTool(e.target.value as Tool)} className="w-full rounded bg-slate-800 px-2 py-1">
        <option value="render_text_logo">Text logo</option>
        <option value="render_primitive_scene">Primitive scene</option>
        <option value="render_turntable">Turntable (uploaded .glb)</option>
      </select>
      {tool === "render_text_logo" && (
        <div className="grid grid-cols-2 gap-2">
          <input value={text} maxLength={40} onChange={(e) => setText(e.target.value)} className="col-span-2 rounded bg-slate-800 px-2 py-1" />
          <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="rounded bg-slate-800 px-2 py-1">
            {["Inter", "Merriweather", "JetBrainsMono"].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-full" />
          <label className="col-span-2">
            Metallic {metallic}
            <input type="range" min={0} max={1} step={0.05} value={metallic} onChange={(e) => setMetallic(Number(e.target.value))} className="w-full" />
          </label>
        </div>
      )}
      {tool === "render_primitive_scene" && (
        <textarea value={sceneJson} onChange={(e) => setSceneJson(e.target.value)} rows={10} className="w-full rounded bg-slate-800 px-2 py-1 font-mono text-[11px]" />
      )}
      {tool === "render_turntable" && (
        <select value={modelKey} onChange={(e) => setModelKey(e.target.value)} className="w-full rounded bg-slate-800 px-2 py-1">
          <option value="">Pick an uploaded model…</option>
          {models.map((m) => (
            <option key={m.id} value={m.objectKey}>
              {m.metadata.filename ?? m.objectKey}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-3">
        {tool !== "render_turntable" && (
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={animated} onChange={(e) => setAnimated(e.target.checked)} /> animated
          </label>
        )}
        {(animated || tool === "render_turntable") && (
          <label>
            frames <input type="number" min={1} max={600} value={frames} onChange={(e) => setFrames(Number(e.target.value))} className="w-16 rounded bg-slate-800 px-2 py-1" />
          </label>
        )}
        <span className="flex-1" />
        <button onClick={() => void submit()} className="rounded bg-violet-500 px-3 py-1.5 font-semibold text-slate-950">
          Render 3D
        </button>
      </div>
      {error && <p className="text-red-400">{error}</p>}
      {job && <JobStatus job={job} />}
    </div>
  );
}
