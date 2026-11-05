"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { forwardRef, useMemo } from "react";
import { StoryComposition } from "@storyflow/compositions";
import { buildCanonicalProps, mediaTypeOf } from "@storyflow/shared/props";
import type { Asset, Project, Track } from "@/lib/api";

interface Props {
  project: Project;
  tracks: Track[];
  assets: Asset[];
  assetUrls: Record<string, string>;
}

/** Live preview: same component + same canonical-props builder as the render worker. */
export const PlayerPanel = forwardRef<PlayerRef, Props>(function PlayerPanel({ project, tracks, assets, assetUrls }, ref) {
  const inputProps = useMemo(() => {
    const ready = new Set(assets.filter((a) => a.status === "READY" && assetUrls[a.id]).map((a) => a.id));
    const media = Object.fromEntries(assets.map((a) => [a.id, mediaTypeOf(a.mimeType)]));
    // Clips whose asset has no URL yet are left out of the preview instead of throwing.
    const previewable = tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => !c.assetId || ready.has(c.assetId)) }));
    return { ...buildCanonicalProps(project, previewable, media), assetUrls };
  }, [project, tracks, assets, assetUrls]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-black">
      <Player
        ref={ref}
        component={StoryComposition}
        inputProps={inputProps}
        durationInFrames={inputProps.durationInFrames}
        compositionWidth={project.width}
        compositionHeight={project.height}
        fps={project.fps}
        controls
        clickToPlay
        style={{ width: "100%", aspectRatio: `${project.width} / ${project.height}` }}
      />
    </div>
  );
});
