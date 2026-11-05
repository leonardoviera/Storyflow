"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Asset, Clip, Track } from "@/lib/api";

const KIND_COLORS: Record<Track["kind"], string> = {
  VISUAL: "bg-sky-700 border-sky-400",
  OVERLAY_3D: "bg-violet-700 border-violet-400",
  TEXT: "bg-emerald-700 border-emerald-400",
  AUDIO: "bg-amber-700 border-amber-400",
};

interface Props {
  clip: Clip;
  track: Track;
  asset?: Asset;
  pxPerFrame: number;
  selected: boolean;
  onSelect: () => void;
  onTrimStart: (edge: "left" | "right", e: React.PointerEvent) => void;
}

export function ClipBlock({ clip, track, asset, pxPerFrame, selected, onSelect, onTrimStart }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `clip:${clip.id}`,
    data: { type: "clip", clipId: clip.id, trackId: track.id },
    disabled: track.locked,
  });
  const label = clip.props.text ?? asset?.metadata.filename ?? asset?.metadata.tool ?? asset?.kind ?? "clip";

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      style={{
        left: clip.startFrame * pxPerFrame,
        width: Math.max(clip.durationInFrames * pxPerFrame, 6),
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 20 : selected ? 10 : 1,
      }}
      className={`absolute top-1 bottom-1 cursor-grab overflow-hidden rounded border text-xs select-none ${KIND_COLORS[track.kind]} ${
        selected ? "ring-2 ring-white" : ""
      } ${isDragging ? "opacity-70" : ""}`}
      title={`${label} · ${clip.startFrame}–${clip.startFrame + clip.durationInFrames}`}
    >
      {!track.locked && (
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            onTrimStart("left", e);
          }}
          className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/30 hover:bg-white/70"
        />
      )}
      <div className="truncate px-2 py-1">{label}</div>
      {!track.locked && (
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            onTrimStart("right", e);
          }}
          className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/30 hover:bg-white/70"
        />
      )}
    </div>
  );
}
