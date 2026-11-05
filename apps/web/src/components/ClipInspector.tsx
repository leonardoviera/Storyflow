"use client";

import type { ClipProps } from "@storyflow/shared/schemas";
import type { Clip, Track } from "@/lib/api";

type TransitionType = "fade" | "slide" | "wipe";

interface Props {
  clip: Clip;
  track: Track;
  onChange: (props: ClipProps) => void;
  onDelete: () => void;
}

const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v)));

export function ClipInspector({ clip, track, onChange, onDelete }: Props) {
  const p = clip.props;
  const set = (patch: Partial<ClipProps>) => onChange({ ...p, ...patch });
  const t = p.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 };

  const transitionField = (key: "transitionIn" | "transitionOut", label: string) => (
    <label className="block">
      {label}
      <div className="mt-1 flex gap-1">
        <select
          value={p[key]?.type ?? ""}
          onChange={(e) =>
            set({ [key]: e.target.value ? { type: e.target.value as TransitionType, durationInFrames: p[key]?.durationInFrames ?? 12 } : undefined })
          }
          className="flex-1 rounded bg-slate-800 px-2 py-1"
        >
          <option value="">none</option>
          <option value="fade">fade</option>
          <option value="slide">slide</option>
          <option value="wipe">wipe</option>
        </select>
        {p[key] && (
          <input
            type="number"
            min={1}
            value={p[key]!.durationInFrames}
            onChange={(e) => set({ [key]: { ...p[key]!, durationInFrames: Math.max(1, Math.round(Number(e.target.value))) } })}
            className="w-16 rounded bg-slate-800 px-2 py-1"
            title="frames"
          />
        )}
      </div>
    </label>
  );

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Clip · {track.kind.replace("_", " ")}</h3>
        <button onClick={onDelete} className="rounded px-2 py-1 text-red-400 hover:bg-red-500/10">
          Delete
        </button>
      </div>
      <div className="text-slate-400">
        frames {clip.startFrame}–{clip.startFrame + clip.durationInFrames} · trim {clip.trimStartFrame}
      </div>
      {track.kind === "TEXT" && (
        <>
          <label className="block">
            Text <span className="text-slate-500">({(p.text ?? "").length}/200)</span>
            <textarea maxLength={200} value={p.text ?? ""} onChange={(e) => set({ text: e.target.value })} className="mt-1 w-full rounded bg-slate-800 px-2 py-1" rows={2} />
          </label>
          <div className="flex gap-2">
            <label className="flex-1">
              Colour
              <input type="color" value={p.color ?? "#ffffff"} onChange={(e) => set({ color: e.target.value.toUpperCase() })} className="mt-1 h-7 w-full" />
            </label>
            <label className="flex-1">
              Background
              <div className="mt-1 flex gap-1">
                <input type="color" value={p.background ?? "#000000"} onChange={(e) => set({ background: e.target.value.toUpperCase() })} className="h-7 flex-1" />
                {p.background && (
                  <button onClick={() => set({ background: undefined })} className="rounded bg-slate-800 px-1">
                    ×
                  </button>
                )}
              </div>
            </label>
          </div>
        </>
      )}
      {track.kind !== "AUDIO" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(["x", "y", "scale", "rotation"] as const).map((k) => (
              <label key={k}>
                {k}
                <input
                  type="number"
                  step={k === "scale" ? 0.05 : 1}
                  value={t[k]}
                  onChange={(e) => set({ transform: { ...t, [k]: Number(e.target.value) } })}
                  className="mt-1 w-full rounded bg-slate-800 px-2 py-1"
                />
              </label>
            ))}
          </div>
          <label className="block">
            Opacity {Math.round((p.opacity ?? 1) * 100)}%
            <input type="range" min={0} max={1} step={0.01} value={p.opacity ?? 1} onChange={(e) => set({ opacity: num(e.target.value, 0, 1) })} className="w-full" />
          </label>
          {track.kind !== "TEXT" && (
            <label className="block">
              Fit
              <select value={p.fit ?? (track.kind === "VISUAL" ? "cover" : "contain")} onChange={(e) => set({ fit: e.target.value as "cover" | "contain" })} className="mt-1 w-full rounded bg-slate-800 px-2 py-1">
                <option value="cover">cover</option>
                <option value="contain">contain</option>
              </select>
            </label>
          )}
          {transitionField("transitionIn", "Transition in")}
          {transitionField("transitionOut", "Transition out")}
        </>
      )}
      {track.kind === "AUDIO" && (
        <label className="block">
          Volume {Math.round((p.volume ?? 1) * 100)}%
          <input type="range" min={0} max={1} step={0.01} value={p.volume ?? 1} onChange={(e) => set({ volume: num(e.target.value, 0, 1) })} className="w-full" />
        </label>
      )}
    </div>
  );
}
