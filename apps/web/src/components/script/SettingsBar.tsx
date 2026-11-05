"use client";

import type { ScriptSettings } from "@storyflow/shared/breakdown";

/** Aspect ratio, episode length and episode count (FR-004). Defaults: 9:16, 60 s, 1 episode. */
export function SettingsBar({
  settings,
  onChange,
  disabled,
}: {
  settings: ScriptSettings;
  onChange: (patch: Partial<ScriptSettings>) => void;
  disabled?: boolean;
}) {
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n || min)));
  return (
    <div className="flex flex-wrap items-end gap-4 rounded border border-slate-800 bg-slate-900/60 p-3 text-sm">
      <fieldset className="flex items-center gap-2" disabled={disabled}>
        <legend className="mb-1 text-xs text-slate-400">Aspect ratio</legend>
        {(
          [
            ["PORTRAIT_9_16", "9:16"],
            ["LANDSCAPE_16_9", "16:9"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange({ aspectRatio: value })}
            className={`rounded px-3 py-1 ${settings.aspectRatio === value ? "bg-sky-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <label className="flex flex-col text-xs text-slate-400">
        Episode length (s)
        <input
          type="number"
          min={15}
          max={300}
          disabled={disabled}
          value={settings.episodeSeconds}
          onChange={(e) => onChange({ episodeSeconds: clamp(Number(e.target.value), 15, 300) })}
          className="mt-1 w-24 rounded bg-slate-800 px-2 py-1 text-sm text-slate-100"
        />
      </label>
      <label className="flex flex-col text-xs text-slate-400">
        Episodes
        <input
          type="number"
          min={1}
          max={20}
          disabled={disabled}
          value={settings.episodeCount}
          onChange={(e) => onChange({ episodeCount: clamp(Number(e.target.value), 1, 20) })}
          className="mt-1 w-20 rounded bg-slate-800 px-2 py-1 text-sm text-slate-100"
        />
      </label>
    </div>
  );
}
