"use client";

import { useMemo, useState } from "react";
import type { Asset, Track } from "@/lib/api";
import type { TimelineIssue } from "@storyflow/shared/timeline";
import { TrackRow } from "./TrackRow";

interface Props {
  tracks: Track[];
  assets: Asset[];
  fps: number;
  playheadFrame: number;
  selectedClipId: string | null;
  pxPerFrame: number;
  onZoom: (pxPerFrame: number) => void;
  onSelectClip: (clipId: string | null) => void;
  onSeek: (frame: number) => void;
  update: (fn: (prev: Track[]) => Track[]) => TimelineIssue[];
  onRejected: (issues: TimelineIssue[]) => void;
}

/** Multi-track, frame-based timeline. Moves are handled by the editor's DndContext; trims here. */
export function Timeline({ tracks, assets, fps, playheadFrame, selectedClipId, pxPerFrame, onZoom, onSelectClip, onSeek, update, onRejected }: Props) {
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const [trimPreview, setTrimPreview] = useState<Track[] | null>(null);
  const shown = trimPreview ?? tracks;
  const end = Math.max(...shown.flatMap((t) => t.clips.map((c) => c.startFrame + c.durationInFrames)), fps * 10);
  const widthPx = (end + fps * 5) * pxPerFrame;

  const startTrim = (clipId: string, edge: "left" | "right", e: React.PointerEvent) => {
    const startX = e.clientX;
    const apply = (clientX: number) => {
      const delta = Math.round((clientX - startX) / pxPerFrame);
      return tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId) return c;
          if (edge === "right") return { ...c, durationInFrames: Math.max(1, c.durationInFrames + delta) };
          const d = Math.max(Math.min(delta, c.durationInFrames - 1), -c.startFrame, -c.trimStartFrame);
          return { ...c, startFrame: c.startFrame + d, durationInFrames: c.durationInFrames - d, trimStartFrame: c.trimStartFrame + d };
        }),
      }));
    };
    const move = (ev: PointerEvent) => setTrimPreview(apply(ev.clientX));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setTrimPreview(null);
      const next = apply(ev.clientX);
      const issues = update(() => next);
      if (issues.length) onRejected(issues);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const seconds = Math.ceil(end / fps) + 5;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950">
      <div className="flex items-center gap-3 border-b border-slate-800 px-3 py-1 text-xs text-slate-400">
        <span>
          {(playheadFrame / fps).toFixed(2)} s · frame {playheadFrame}
        </span>
        <span className="flex-1" />
        Zoom
        <input type="range" min={1} max={12} step={0.5} value={pxPerFrame} onChange={(e) => onZoom(Number(e.target.value))} />
      </div>
      <div className="relative overflow-x-auto" onClick={() => onSelectClip(null)}>
        <div style={{ width: widthPx + 160 }}>
          <div
            className="sticky top-0 z-20 ml-40 flex h-6 cursor-pointer border-b border-slate-800 text-[10px] text-slate-500"
            style={{ width: widthPx }}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              onSeek(Math.max(0, Math.round((e.clientX - rect.left) / pxPerFrame)));
            }}
          >
            {Array.from({ length: seconds }, (_, s) => (
              <div key={s} className="absolute border-l border-slate-700 pl-1" style={{ left: s * fps * pxPerFrame }}>
                {s}s
              </div>
            ))}
          </div>
          {shown.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              assets={assetMap}
              pxPerFrame={pxPerFrame}
              widthPx={widthPx}
              selectedClipId={selectedClipId}
              onSelectClip={onSelectClip}
              onTrimStart={startTrim}
              onToggle={(field) => update((prev) => prev.map((t) => (t.id === track.id ? { ...t, [field]: !t[field] } : t)))}
              onRemove={() => update((prev) => prev.filter((t) => t.id !== track.id))}
            />
          ))}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-red-500"
            style={{ left: 160 + playheadFrame * pxPerFrame }}
          />
        </div>
      </div>
    </div>
  );
}
