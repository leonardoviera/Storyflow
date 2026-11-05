"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Asset, Track } from "@/lib/api";
import { ClipBlock } from "./ClipBlock";

interface Props {
  track: Track;
  assets: Map<string, Asset>;
  pxPerFrame: number;
  widthPx: number;
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onTrimStart: (clipId: string, edge: "left" | "right", e: React.PointerEvent) => void;
  onToggle: (field: "muted" | "locked") => void;
  onRemove: () => void;
}

export function TrackRow({ track, assets, pxPerFrame, widthPx, selectedClipId, onSelectClip, onTrimStart, onToggle, onRemove }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `track:${track.id}`, data: { trackId: track.id, kind: track.kind } });

  return (
    <div className="flex h-12 border-b border-slate-800">
      <div className="sticky left-0 z-30 flex w-40 shrink-0 items-center gap-1 border-r border-slate-800 bg-slate-900 px-2 text-xs">
        <span className="flex-1 truncate font-semibold">{track.kind.replace("_", " ")}</span>
        <button onClick={() => onToggle("muted")} title="Mute" className={`rounded px-1 ${track.muted ? "bg-red-500/40" : "hover:bg-slate-700"}`}>
          M
        </button>
        <button onClick={() => onToggle("locked")} title="Lock" className={`rounded px-1 ${track.locked ? "bg-amber-500/40" : "hover:bg-slate-700"}`}>
          L
        </button>
        <button onClick={onRemove} title="Remove track" className="rounded px-1 hover:bg-slate-700">
          ×
        </button>
      </div>
      <div ref={setNodeRef} className={`relative ${isOver ? "bg-sky-500/10" : ""} ${track.muted ? "opacity-50" : ""}`} style={{ width: widthPx }}>
        {track.clips.map((clip) => (
          <ClipBlock
            key={clip.id}
            clip={clip}
            track={track}
            asset={clip.assetId ? assets.get(clip.assetId) : undefined}
            pxPerFrame={pxPerFrame}
            selected={clip.id === selectedClipId}
            onSelect={() => onSelectClip(clip.id)}
            onTrimStart={(edge, e) => onTrimStart(clip.id, edge, e)}
          />
        ))}
      </div>
    </div>
  );
}
