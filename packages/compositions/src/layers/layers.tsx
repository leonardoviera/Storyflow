import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, useCurrentFrame } from "remotion";
import type { CompositionClip, StoryCompositionProps } from "@storyflow/shared/schemas";
import { clipStyle } from "./transitions";

// One component per track kind. A missing asset URL throws so a bad prop fails loudly
// instead of rendering blank (contracts/composition-props.md).

interface LayerProps {
  clip: CompositionClip;
  props: StoryCompositionProps;
}

function urlFor(props: StoryCompositionProps, assetId: string | null): string {
  const url = assetId ? props.assetUrls?.[assetId] : undefined;
  if (!url) throw new Error(`StoryComposition: no resolved URL for asset ${assetId ?? "(null)"}`);
  return url;
}

function isVideo(props: StoryCompositionProps, assetId: string | null): boolean {
  return !!assetId && props.assetMedia?.[assetId] === "video";
}

export const VisualLayer: React.FC<LayerProps> = ({ clip, props }) => {
  const frame = useCurrentFrame();
  const src = urlFor(props, clip.assetId);
  const fit = clip.props.fit ?? "cover";
  const style = { width: "100%", height: "100%", objectFit: fit } as const;
  return (
    <AbsoluteFill style={clipStyle(clip.props, frame, clip.durationInFrames)}>
      {isVideo(props, clip.assetId) ? (
        <OffthreadVideo src={src} style={style} startFrom={clip.trimStartFrame} muted />
      ) : (
        <Img src={src} style={style} />
      )}
    </AbsoluteFill>
  );
};

export const Overlay3dLayer: React.FC<LayerProps> = ({ clip, props }) => {
  const frame = useCurrentFrame();
  const src = urlFor(props, clip.assetId);
  const style = { width: "100%", height: "100%", objectFit: clip.props.fit ?? "contain" } as const;
  return (
    <AbsoluteFill style={clipStyle(clip.props, frame, clip.durationInFrames)}>
      {isVideo(props, clip.assetId) ? (
        <OffthreadVideo src={src} style={style} startFrom={clip.trimStartFrame} transparent muted />
      ) : (
        <Img src={src} style={style} />
      )}
    </AbsoluteFill>
  );
};

export const TextLayer: React.FC<LayerProps> = ({ clip, props }) => {
  const frame = useCurrentFrame();
  const [bg, fg] = props.style.palette;
  return (
    <AbsoluteFill
      style={{
        ...clipStyle(clip.props, frame, clip.durationInFrames),
        backgroundColor: clip.props.background,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontFamily: props.style.fontFamily,
          fontWeight: 700,
          fontSize: Math.round(props.height / 10),
          color: clip.props.color ?? fg ?? "#FFFFFF",
          textShadow: clip.props.background ? undefined : `0 4px 24px ${bg ?? "#000000"}`,
          textAlign: "center",
          padding: "0 8%",
          lineHeight: 1.15,
        }}
      >
        {clip.props.text ?? ""}
      </div>
    </AbsoluteFill>
  );
};

export const AudioLayer: React.FC<LayerProps> = ({ clip, props }) => (
  <Audio src={urlFor(props, clip.assetId)} startFrom={clip.trimStartFrame} volume={clip.props.volume ?? 1} />
);
