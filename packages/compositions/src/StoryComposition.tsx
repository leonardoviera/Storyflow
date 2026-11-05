import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Sequence } from "remotion";
import type { StoryCompositionProps, TrackKind } from "@storyflow/shared/schemas";
import { ensureFontsLoaded } from "./fonts";
import { AudioLayer, Overlay3dLayer, TextLayer, VisualLayer } from "./layers/layers";

const LAYERS: Record<TrackKind, typeof VisualLayer> = {
  VISUAL: VisualLayer,
  OVERLAY_3D: Overlay3dLayer,
  TEXT: TextLayer,
  AUDIO: AudioLayer,
};

/** Pure function of props + frame (constitution II). Higher track `order` draws on top. */
export const StoryComposition: React.FC<StoryCompositionProps> = (props) => {
  const [handle] = useState(() => delayRender("Loading self-hosted fonts"));
  useEffect(() => {
    ensureFontsLoaded()
      .then(() => continueRender(handle))
      .catch((err) => {
        console.error(err);
        continueRender(handle);
      });
  }, [handle]);

  const tracks = [...props.tracks].filter((t) => !t.muted).sort((a, b) => a.order - b.order);

  return (
    <AbsoluteFill style={{ backgroundColor: props.style.palette[0] ?? "#000000" }}>
      {tracks.map((track) => {
        const Layer = LAYERS[track.kind];
        return (
          <AbsoluteFill key={track.id}>
            {track.clips.map((clip) => (
              <Sequence
                key={clip.id}
                from={clip.startFrame}
                durationInFrames={clip.durationInFrames}
                layout={track.kind === "AUDIO" ? "none" : "absolute-fill"}
              >
                <Layer clip={clip} props={props} />
              </Sequence>
            ))}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

export { ensureFontsLoaded };
